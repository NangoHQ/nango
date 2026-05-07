import http from 'node:http';
import https from 'node:https';

import followRedirects from 'follow-redirects';

import type { ClientRequest, IncomingMessage, RequestOptions } from 'node:http';
import type { Socket } from 'node:net';

/**
 * Metered bytes emitted by `createMeteringTransport`.
 *
 * These are deltas on the Node `Socket` attached to each outbound `ClientRequest`
 * (typically `net.Socket` for `http:`, `tls.TLSSocket` for `https:`). They
 * approximate wire transfer including HTTP framing and (for TLS) encrypted
 * payload, not application-level decompressed bodies.
 *
 * `partial` is `true` when the hop did not complete cleanly (error, abort, or
 * connection closed before the response finished). Intentional terminations —
 * e.g. follow-redirects destroying a 3xx response body — are NOT partial.
 */
export interface MeteredBytes {
    sent: number;
    received: number;
    partial: boolean;
}

interface TransportOptions extends RequestOptions {
    protocol?: string | undefined | null;
}

type TransportCallback = (res: IncomingMessage) => void;

interface FollowRedirectsWithWrap {
    wrap: (modules: { http: NativeProtocolModule; https: NativeProtocolModule }) => { http: NativeProtocolModule; https: NativeProtocolModule };
}

interface NativeProtocolModule {
    request: (options: TransportOptions, callback?: TransportCallback) => ClientRequest;
}

function wrapWithSocketMetering(nativeModule: NativeProtocolModule, onHopBytes: (bytes: MeteredBytes) => void): NativeProtocolModule {
    return {
        request(options, callback) {
            let socketRef: Socket | undefined;
            let startRead = 0;
            let startWritten = 0;
            let finalized = false;
            let sawResponse = false;

            const emit = (partial: boolean) => {
                if (finalized) {
                    return;
                }
                finalized = true;

                const sock = socketRef;
                const bytes: MeteredBytes = {
                    sent: sock ? Math.max(0, sock.bytesWritten - startWritten) : 0,
                    received: sock ? Math.max(0, sock.bytesRead - startRead) : 0,
                    partial
                };

                try {
                    onHopBytes(bytes);
                } catch {
                    // swallow: callback errors must not affect transport behavior.
                }
            };

            const attachSocket = (sock: Socket) => {
                if (socketRef) {
                    return;
                }
                socketRef = sock;
                startRead = sock.bytesRead;
                startWritten = sock.bytesWritten;
            };

            const req = nativeModule.request(options, (res) => {
                sawResponse = true;

                res.once('end', () => {
                    emit(false);
                });
                res.once('error', () => {
                    emit(true);
                });
                res.once('close', () => {
                    // follow-redirects intentionally destroys 3xx response bodies
                    // before they are fully read. That is not an unclean termination,
                    // so treat redirect closes as clean regardless of res.complete.
                    const isRedirect = res.statusCode !== undefined && res.statusCode >= 300 && res.statusCode < 400;
                    emit(!res.complete && !isRedirect);
                });

                if (callback) {
                    callback(res);
                }
            });

            if (req.socket) {
                attachSocket(req.socket);
            } else {
                req.once('socket', attachSocket);
            }

            req.once('error', () => {
                emit(true);
            });

            req.once('close', () => {
                if (!finalized && !sawResponse) {
                    emit(true);
                }
            });

            return req;
        }
    };
}

/**
 * Axios-compatible `transport` that meters transferred bytes.
 *
 * Axios' Node adapter calls `transport.request(options, callback)` for each
 * outbound attempt. This implementation delegates to `follow-redirects` (what
 * Axios uses by default) so redirect following matches current behavior.
 *
 * Each redirect hop runs through the bytes-metering wrapper independently and
 * invokes `onBytes` once per hop.
 */
export function createMeteringTransport(onBytes: (bytes: MeteredBytes) => void): {
    request: (options: TransportOptions, callback?: TransportCallback) => ClientRequest;
} {
    const meteredHttp = wrapWithSocketMetering(http, onBytes);
    const meteredHttps = wrapWithSocketMetering(https, onBytes);

    const wrapped = (followRedirects as unknown as FollowRedirectsWithWrap).wrap({
        http: meteredHttp,
        https: meteredHttps
    });

    return {
        request(options, callback) {
            const target = options.protocol === 'https:' ? wrapped.https : wrapped.http;
            return target.request(options, callback);
        }
    };
}

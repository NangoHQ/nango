import http from 'node:http';
import https from 'node:https';
import { finished } from 'node:stream';

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
 */
export interface MeteredBytes {
    sent: number;
    received: number;
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

function withSocketMetering(nativeModule: NativeProtocolModule, onHopBytes: (bytes: MeteredBytes) => void): NativeProtocolModule {
    return {
        request(options, callback) {
            let socketRef: Socket | undefined;
            let startRead = 0;
            let startWritten = 0;
            let finalized = false;

            const emit = () => {
                if (finalized) {
                    return;
                }
                finalized = true;

                const sock = socketRef;
                const bytes: MeteredBytes = {
                    sent: sock ? Math.max(0, sock.bytesWritten - startWritten) : 0,
                    received: sock ? Math.max(0, sock.bytesRead - startRead) : 0
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
                const cleanup = finished(res, () => {
                    cleanup();
                    emit();
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

            req.once('error', emit);
            req.once('close', emit);

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
export function createMeteringTransport(
    onBytes: (bytes: MeteredBytes) => void,
    // Axios skips wiring options.beforeRedirects.config for custom transports.
    // Accept it here and wire it manually so header-forwarding still fires on redirects.
    userBeforeRedirect?: (options: Record<string, unknown>, responseDetails?: unknown) => void
): {
    request: (options: TransportOptions, callback?: TransportCallback) => ClientRequest;
} {
    const meteredHttp = withSocketMetering(http, onBytes);
    const meteredHttps = withSocketMetering(https, onBytes);

    const wrapped = (followRedirects as unknown as FollowRedirectsWithWrap).wrap({
        http: meteredHttp,
        https: meteredHttps
    });

    return {
        request(options, callback) {
            if (userBeforeRedirect) {
                const beforeRedirects = (options as unknown as Record<string, unknown>)['beforeRedirects'] as Record<string, unknown> | undefined;
                if (beforeRedirects && !beforeRedirects['config']) {
                    beforeRedirects['config'] = userBeforeRedirect;
                }
            }
            const target = options.protocol === 'https:' ? wrapped.https : wrapped.http;
            return target.request(options, callback);
        }
    };
}

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
    maxRedirects?: number | undefined;
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

                if (bytes.sent === 0 && bytes.received === 0) {
                    return;
                }

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

function wireBeforeRedirect(options: TransportOptions, fn: (options: Record<string, unknown>, responseDetails?: unknown) => void): void {
    const beforeRedirects = (options as unknown as Record<string, unknown>)['beforeRedirects'] as Record<string, unknown> | undefined;
    if (beforeRedirects && !beforeRedirects['config']) {
        beforeRedirects['config'] = fn;
    }
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
export interface MeteringTransportOptions {
    /** Invoked once per redirect hop with the socket byte deltas for that hop. */
    onBytes: (bytes: MeteredBytes) => void;
    /**
     * Axios skips wiring options.beforeRedirects.config for custom transports. Pass it here and we wire
     * it manually so header-forwarding (and redirect validation) still fires on redirects.
     */
    beforeRedirect?: ((options: Record<string, unknown>, responseDetails?: unknown) => void) | undefined;
    /**
     * Axios only copies config.maxRedirects into options.maxRedirects for its built-in follow-redirects
     * transport; with a custom transport it's skipped, so follow-redirects would fall back to its default
     * of 21. Pass the cap here and we set it manually to honor the configured policy.
     */
    maxRedirects?: number | undefined;
}

export function createMeteringTransport({ onBytes, beforeRedirect, maxRedirects }: MeteringTransportOptions): {
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
            if (beforeRedirect) {
                wireBeforeRedirect(options, beforeRedirect);
            }
            if (maxRedirects !== undefined) {
                options.maxRedirects = maxRedirects;
            }
            const target = options.protocol === 'https:' ? wrapped.https : wrapped.http;
            return target.request(options, callback);
        }
    };
}

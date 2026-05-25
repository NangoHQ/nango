import { getBaseUrlOverrideDenylistFromEnv, isBaseUrlOverrideDenied } from './baseUrlOverrideDenylist.js';

import type { HTTP_METHOD } from '@nangohq/types';

const UNCONTROLLED_FETCH_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const ALLOWED_REDIRECT_PROTOCOLS = new Set(['http:', 'https:']);

export interface UncontrolledFetchDeps {
    throwError: (code: string, message: string) => never;
    recordTransfer: (params: { bytesSent: number; bytesReceived: number }) => void;
}

export async function executeUncontrolledFetch(
    options: {
        url: URL;
        method?: HTTP_METHOD;
        headers?: Record<string, string> | undefined;
        body?: string | null;
    },
    deps: UncontrolledFetchDeps
): Promise<Response> {
    const recordTransfer = (params: { bytesSent: number; bytesReceived: number }) => {
        if (params.bytesSent > 0 || params.bytesReceived > 0) deps.recordTransfer(params);
    };

    const baseUrlOverrideDenylist = getBaseUrlOverrideDenylistFromEnv();

    const throwIfDenied = (absoluteUrl: string): void => {
        if (baseUrlOverrideDenylist.size > 0 && isBaseUrlOverrideDenied(absoluteUrl, baseUrlOverrideDenylist)) {
            deps.throwError('url_not_allowed', 'This URL is not allowed by server configuration.');
        }
    };

    throwIfDenied(options.url.toString());

    let currentUrl = new URL(options.url.href);
    let method: HTTP_METHOD = options.method || 'GET';
    let body: string | undefined = options.body ?? undefined;
    const headerBag = new Headers(options.headers);

    for (let redirectsFollowed = 0; ; redirectsFollowed++) {
        const props: RequestInit = {
            headers: new Headers(headerBag),
            method,
            redirect: 'manual'
            // TODO: use agent
        };

        if (body) {
            props.body = body;
        }

        const response = await fetch(currentUrl, props);

        const bytesSent = countRequestBytes(props.headers as Headers, body);
        const bytesReceived = countHeaderBytes(response.headers);

        if (!REDIRECT_STATUS_CODES.has(response.status)) {
            let contentLength = parseContentLength(response.headers);

            if (contentLength === null && response.body === null) {
                contentLength = 0;
            }

            if (contentLength !== null) {
                recordTransfer({ bytesSent: bytesSent, bytesReceived: bytesReceived + contentLength });
                return response;
            }

            // CL not present: emit known bytes now; body bytes follow when stream settles.
            recordTransfer({ bytesSent, bytesReceived });
            return tapResponseStreamAndCount(response, ({ bytes }) => {
                recordTransfer({ bytesSent: 0, bytesReceived: bytes });
            });
        }

        recordTransfer({ bytesSent: bytesSent, bytesReceived: bytesReceived + (parseContentLength(response.headers) ?? 0) });

        const location = response.headers.get('Location');

        if (!location) {
            // Return as-is when there's a redirect status but no Location header.
            return response;
        }

        // We're about to follow the redirect; we won't return this response, so cancel its body.
        void response.body?.cancel();

        if (redirectsFollowed >= UNCONTROLLED_FETCH_MAX_REDIRECTS) {
            deps.throwError('too_many_redirects', `Exceeded maximum of ${UNCONTROLLED_FETCH_MAX_REDIRECTS} redirects.`);
        }

        let nextUrl: URL;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            deps.throwError('invalid_redirect', 'Redirect Location could not be parsed as a URL.');
        }

        // Native fetch rejects redirects to non-HTTP(S) schemes.
        if (!ALLOWED_REDIRECT_PROTOCOLS.has(nextUrl.protocol)) {
            deps.throwError('invalid_redirect', 'Redirect Location must use http: or https:.');
        }

        throwIfDenied(nextUrl.toString());

        // Native fetch strips sensitive headers when redirecting to a different origin.
        // Because we follow redirects manually, we must replicate that to avoid credential leaks.
        if (currentUrl.origin !== nextUrl.origin) {
            headerBag.delete('authorization');
            headerBag.delete('proxy-authorization');
            headerBag.delete('cookie');
        }

        // Match common fetch redirect semantics:
        // - 303: switch to GET only if method is neither GET nor HEAD (drop body)
        // - 301/302: switch to GET only for POST (preserve PUT/PATCH/DELETE, etc.)
        // - 307/308: preserve method and body
        const upperMethod = method.toUpperCase();
        const shouldSwitchToGet =
            (response.status === 303 && upperMethod !== 'GET' && upperMethod !== 'HEAD') ||
            ((response.status === 301 || response.status === 302) && upperMethod === 'POST');
        if (shouldSwitchToGet) {
            method = 'GET';
            body = undefined;
            // When we rewrite to GET, drop request-body specific headers (native fetch does not forward them).
            for (const h of [
                'content-length',
                'content-type',
                'content-encoding',
                'content-language',
                'content-location',
                'content-md5',
                'content-range',
                'transfer-encoding'
            ]) {
                headerBag.delete(h);
            }
        }

        currentUrl = nextUrl;
    }
}

export function parseContentLength(headers: Headers): number | null {
    const cl = headers.get('content-length');
    if (cl === null) return null;
    const n = parseInt(cl, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
}

export function countHeaderBytes(headers: Headers): number {
    let bytes = 0;
    headers.forEach((value, name) => {
        bytes += Buffer.byteLength(name, 'utf8') + Buffer.byteLength(value, 'utf8');
    });
    return bytes;
}

export function countRequestBytes(headers: Headers, body?: string): number {
    let bytes = body !== undefined ? Buffer.byteLength(body, 'utf8') : 0;
    bytes += countHeaderBytes(headers);
    return bytes;
}

export function tapResponseStreamAndCount(response: Response, onStreamedBytes: (params: { bytes: number }) => void): Response {
    // defensive check: shouldn't happen as we validate before calling this function
    if (response.body === null) {
        return response;
    }

    let streamedBytes = 0;
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
            streamedBytes += chunk.byteLength;
            controller.enqueue(chunk);
        },
        flush() {
            onStreamedBytes({ bytes: streamedBytes });
        }
    });

    void response.body.pipeTo(writable).catch(() => {
        // Swallow errors: if the caller cancels the stream the flush may not fire,
        // which is acceptable — we avoid forcing a download just for metering.
    });

    return proxyResponseBody(readable, response);
}

/**
 * Returns a Proxy over `response` that routes property accesses in two ways:
 * - Body-related properties (`body`, `bodyUsed`, `text`, `json`, `arrayBuffer`,
 *   `blob`, `formData`, `clone`) are routed to a body façade built on top of
 *   `readable`, so body consumption goes through the tapped stream.
 * - Everything else (including `url`, `type`, and other runtime-populated
 *   read-only fields) is routed to the original response object, which
 *   constructing `new Response(…)` would silently drop.
 *
 * Note: `clone()` resolves through the body façade, so clones lose `url`/`type` —
 * acceptable since `clone()` is used for body re-reading, not metadata access.
 */
function proxyResponseBody(readable: ReadableStream<Uint8Array>, response: Response) {
    const bodyFacade = new Response(readable, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
    });

    return new Proxy(response, {
        get(target, prop: string | symbol) {
            switch (prop) {
                case 'body':
                    return readable;
                case 'bodyUsed':
                    return bodyFacade.bodyUsed;
                case 'text':
                case 'json':
                case 'arrayBuffer':
                case 'blob':
                case 'formData':
                case 'bytes':
                case 'clone':
                    return prop in bodyFacade ? (bodyFacade[prop as keyof typeof bodyFacade] as (...args: unknown[]) => unknown).bind(bodyFacade) : undefined;
                default: {
                    const val = Reflect.get(target, prop, target);
                    return typeof val === 'function' ? (val as (...args: unknown[]) => unknown).bind(target) : val;
                }
            }
        }
    });
}

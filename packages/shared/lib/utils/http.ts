import { Err, Ok, redactHeaders, redactObjectOrString, redactURL } from '@nangohq/utils';

import { NangoInternalError } from './error.js';

import type { LogContextStateless } from '@nangohq/logs';
import type { HTTP_METHOD, MessageHTTPRequest, MessageRow } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Agent } from 'undici';

/**
 * Controls how `loggedFetch` follows redirects. When provided, automatic redirect following is
 * disabled (`redirect: 'manual'`) and every hop is validated before being followed, so the caller's
 * outbound policy applies to the whole redirect chain — including hops to raw IP literals, which an
 * agent's DNS lookup never sees.
 */
export interface LoggedFetchRedirectPolicy {
    /** Maximum number of redirect hops to follow before failing. */
    maxRedirects: number;
    /** Validate the next hop. Throw to block it (e.g. blocked IP literal or denied host). */
    validate: (target: URL) => Promise<void> | void;
}

const DEFAULT_MAX_RESPONSE_BYTES = 256 * 1024;

class ResponseTooLargeError extends Error {
    constructor(maxBytes: number) {
        super(`Response body exceeds the maximum allowed size of ${maxBytes} bytes`);
    }
}

/**
 * Read the (already decompressed) body chunk by chunk and stop as soon as it exceeds `maxBytes`,
 * so neither a huge payload nor a small compressed one that expands is ever fully buffered.
 */
async function readBodyWithinLimit(res: Response, maxBytes: number): Promise<string> {
    if (!res.body) {
        return '';
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        received += value.byteLength;
        if (received > maxBytes) {
            await reader.cancel().catch(() => undefined);
            throw new ResponseTooLargeError(maxBytes);
        }
        chunks.push(value);
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Credential material is never forwarded across a redirect hop (same-origin included). Forwarding is
// not opt-in anywhere on this path, so we drop these on every hop rather than relying on cross-origin
// heuristics — matching the OAuth axios path, which also strips credential headers on every hop.
const CREDENTIAL_HEADERS_STRIPPED_ON_REDIRECT = ['authorization', 'cookie', 'proxy-authorization'];

/**
 * Follow redirects manually, validating every hop against `redirectPolicy`. Undici's fetch skips the
 * dispatcher's safe DNS lookup for IP-literal hosts, so relying on the agent alone would let a public
 * token URL redirect straight to a blocked internal IP; validating each `Location` here closes that gap
 * and enforces `maxRedirects` (which the dispatcher does not).
 *
 * Credentials are never forwarded across redirects: credential headers are stripped on every hop, and a
 * cross-origin 307/308 (which would otherwise replay the original credential-bearing POST body — e.g.
 * `client_secret`, a JWT assertion, or a custom-auth password) is refused rather than replayed.
 */
async function fetchFollowingPolicyRedirects(initialUrl: URL, baseProps: RequestInit, redirectPolicy: LoggedFetchRedirectPolicy): Promise<Response> {
    let currentUrl = initialUrl;
    let method = (baseProps.method ?? 'GET').toUpperCase();
    let body = baseProps.body ?? null;
    const headers = new Headers(baseProps.headers);
    let followed = 0;

    for (;;) {
        const res = await fetch(currentUrl, { ...baseProps, method, headers, body, redirect: 'manual' });
        if (!REDIRECT_STATUSES.has(res.status)) {
            return res;
        }
        const location = res.headers.get('location');
        if (!location) {
            return res;
        }

        let target: URL;
        try {
            target = new URL(location, currentUrl);
        } catch {
            // Malformed Location: surface the redirect response rather than following an unparseable target.
            return res;
        }

        // Release the socket before issuing the next request.
        await res.body?.cancel().catch(() => undefined);

        if (followed >= redirectPolicy.maxRedirects) {
            throw new Error(`Maximum number of redirects (${redirectPolicy.maxRedirects}) exceeded`);
        }

        await redirectPolicy.validate(target);

        const isCrossOrigin = target.origin !== currentUrl.origin;

        // Never forward credential headers across a redirect, regardless of origin.
        for (const header of CREDENTIAL_HEADERS_STRIPPED_ON_REDIRECT) {
            headers.delete(header);
        }

        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')) {
            // 301/302/303 downgrade an unsafe method to GET and drop the request body entirely.
            method = 'GET';
            body = null;
            headers.delete('content-type');
            headers.delete('content-length');
        } else if (isCrossOrigin && body != null) {
            // 307/308 preserve method + body. Replaying a credential-bearing body to a different origin
            // would leak it, so refuse the hop instead of forwarding the body unchanged.
            throw new Error(`Refusing to replay request body across origins on redirect to ${target.origin}`);
        }

        currentUrl = target;
        followed += 1;
    }
}

export async function loggedFetch<TBody>(
    {
        url,
        method,
        headers,
        body,
        agent,
        redirect,
        maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES
    }: {
        url: URL;
        method?: HTTP_METHOD;
        headers?: Record<string, string> | undefined;
        body?: string | null;
        agent?: Agent | undefined;
        redirect?: LoggedFetchRedirectPolicy | undefined;
        /** Maximum decompressed response body size; reading stops and the call fails once it is exceeded. */
        maxResponseBytes?: number | undefined;
    },
    options: {
        // TODO: maybe put that in logCtx
        valuesToFilter: string[];
        logCtx: LogContextStateless;
        context: MessageRow['context'];
    }
): Promise<Result<{ res: Response; body: TBody }>> {
    const props: RequestInit = {
        headers: new Headers(headers),
        method: method || 'GET'
    };

    if (agent) {
        (props as any).dispatcher = agent;
    }

    if (body) {
        props.body = body;
    }

    const createdAt = new Date();
    const redactedUrl = redactURL({ url: url.href, valuesToFilter: options.valuesToFilter });
    const requestLog: MessageHTTPRequest = {
        headers: redactHeaders({ headers: headers }),
        method: props.method!,
        url: redactedUrl,
        body: body ? redactObjectOrString({ data: body, valuesToFilter: options.valuesToFilter }) : undefined
    };
    try {
        const res = redirect ? await fetchFollowingPolicyRedirects(url, props, redirect) : await fetch(url, props);
        const text = await readBodyWithinLimit(res, maxResponseBytes);
        let body: TBody;
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            body = JSON.parse(text) as TBody;
        } else {
            body = text as TBody;
        }

        if (res.status >= 300) {
            void options.logCtx.http(`${props.method} ${redactedUrl}`, {
                request: requestLog,
                response: { code: res.status, headers: redactHeaders({ headers: res.headers }) },
                context: options.context,
                createdAt,
                meta: { body }
            });
        } else {
            void options.logCtx.http(`${props.method} ${redactedUrl}`, {
                request: requestLog,
                response: { code: res.status, headers: redactHeaders({ headers: res.headers }) },
                context: options.context,
                createdAt
            });
        }
        return Ok({ res, body });
    } catch (err) {
        let error = err;

        if (err instanceof TypeError && err.cause) {
            // Actual network error are in cause
            error = err.cause;
        }

        void options.logCtx.http(`${props.method} ${redactedUrl}`, {
            level: 'error',
            request: requestLog,
            response: undefined,
            context: options.context,
            createdAt,
            error: error
        });

        return Err(new NangoInternalError(err instanceof ResponseTooLargeError ? 'fetch_response_too_large' : 'fetch_unknown_error', { cause: err }));
    }
}

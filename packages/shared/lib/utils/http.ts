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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Stripped when a redirect crosses origins, matching the browser fetch default so manual following
// does not leak credentials to a different host than the one the caller authenticated against.
const CREDENTIAL_HEADERS_STRIPPED_ON_CROSS_ORIGIN_REDIRECT = ['authorization', 'cookie', 'proxy-authorization'];

/**
 * Follow redirects manually, validating every hop against `redirectPolicy`. Undici's fetch skips the
 * dispatcher's safe DNS lookup for IP-literal hosts, so relying on the agent alone would let a public
 * token URL redirect straight to a blocked internal IP; validating each `Location` here closes that gap
 * and enforces `maxRedirects` (which the dispatcher does not).
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

        if (target.origin !== currentUrl.origin) {
            for (const header of CREDENTIAL_HEADERS_STRIPPED_ON_CROSS_ORIGIN_REDIRECT) {
                headers.delete(header);
            }
        }
        if (res.status === 303 || ((res.status === 301 || res.status === 302) && method !== 'GET' && method !== 'HEAD')) {
            method = 'GET';
            body = null;
            headers.delete('content-type');
            headers.delete('content-length');
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
        redirect
    }: {
        url: URL;
        method?: HTTP_METHOD;
        headers?: Record<string, string> | undefined;
        body?: string | null;
        agent?: Agent | undefined;
        redirect?: LoggedFetchRedirectPolicy | undefined;
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
        let body: TBody;
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            body = (await res.json()) as TBody;
        } else {
            body = (await res.text()) as TBody;
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

        return Err(new NangoInternalError('fetch_unknown_error', { cause: err }));
    }
}

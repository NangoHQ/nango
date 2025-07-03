/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters */
import { Err, Ok, redactHeaders, redactObjectOrString, redactURL } from '@nangohq/utils';
import type { Agent } from 'undici';

import { NangoInternalError } from './error.js';

import type { LogContextStateless } from '@nangohq/logs';
import type { HTTP_METHOD, MessageHTTPRequest, MessageRow } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

export async function loggedFetch<TBody>(
    {
        url,
        method,
        headers,
        body,
        agent
    }: {
        url: URL;
        method?: HTTP_METHOD;
        headers?: Record<string, string> | undefined;
        body?: string | null;
        agent?: Agent | undefined;
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
    const requestLog: MessageHTTPRequest = {
        headers: redactHeaders({ headers: headers }),
        method: props.method!,
        url: redactURL({ url: url.href, valuesToFilter: options.valuesToFilter }),
        body: body ? redactObjectOrString({ data: body, valuesToFilter: options.valuesToFilter }) : undefined
    };
    try {
        const res = await fetch(url, props);
        let body: TBody;
        const contentType = res.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            body = (await res.json()) as TBody;
        } else {
            body = (await res.text()) as TBody;
        }

        if (res.status >= 300) {
            void options.logCtx.http(`${props.method} ${url.href}`, {
                request: requestLog,
                response: { code: res.status, headers: redactHeaders({ headers: res.headers }) },
                context: options.context,
                createdAt,
                meta: { body }
            });
        } else {
            void options.logCtx.http(`${props.method} ${url.href}`, {
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

        void options.logCtx.http(`${props.method} ${url.href}`, {
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

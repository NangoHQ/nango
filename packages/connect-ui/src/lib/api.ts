/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */

import type { ApiError, Endpoint, GetConnectSession, GetPublicListIntegrations, GetPublicProvider } from '@nangohq/types';

import { useGlobal } from './store';

function uriParamsReplacer(tpl: string, data: Record<string, any>) {
    let res = tpl;
    for (const [key, value] of Object.entries(data)) {
        res = res.replace(`:${key}`, value);
    }
    return res;
}

export async function fetchApi<TEndpoint extends Endpoint<{ Path: any; Success: any; Method: any; Querystring?: any }>>(
    path: TEndpoint['Path'],
    opts: (TEndpoint['Method'] extends 'GET' ? { method?: TEndpoint['Method'] } : { method: TEndpoint['Method'] }) &
        (TEndpoint['Body'] extends never ? { body?: undefined } : { body: TEndpoint['Body'] }) &
        (TEndpoint['Querystring'] extends never ? { query?: undefined } : { query: TEndpoint['Querystring'] }) &
        (TEndpoint['Params'] extends never ? { params?: never } : { params: TEndpoint['Params'] }),
    method?: RequestInit['method']
): Promise<TEndpoint['Success']> {
    const url = new URL(useGlobal.getState().apiURL);
    url.pathname = opts.params ? uriParamsReplacer(path, opts.params) : path;

    if (opts?.query) {
        for (const key in opts.query) {
            if (typeof opts.query[key] === 'undefined' || (typeof opts.query[key] === 'string' && opts.query[key] === '')) {
                continue;
            }
            if (Array.isArray(opts.query[key])) {
                for (const val of opts.query[key] as any[]) {
                    url.searchParams.set(key, val);
                }
            } else {
                url.searchParams.set(key, opts.query[key]);
            }
        }
    }

    const headers = new Headers();
    if (opts?.body) {
        headers.append('content-type', 'application/json');
    }

    const sessionToken = useGlobal.getState().sessionToken;
    headers.append('Authorization', `Bearer ${sessionToken}`);

    const res = await fetch(url, {
        method: method || 'GET',
        body: opts?.body && JSON.stringify(opts.body),
        headers
    });

    let json: TEndpoint['Reply'] | undefined;
    if (res.status !== 204) {
        json = (await res.json()) as TEndpoint['Reply'];
    }
    if (res.status !== 200 || isError(json)) {
        throw new APIError({ res, json });
    }

    return json || {};
}

export function isError<TEndpoint extends Endpoint<{ Path: any; Success: any; Method: any }>['Reply']>(
    json: TEndpoint
): json is Exclude<TEndpoint, { data: any }> {
    return json && 'error' in (json as any);
}

export class APIError extends Error {
    details;
    constructor(details: { res: Response; json: Record<string, any> | ApiError<any> | undefined }) {
        super('err');
        this.details = details;
    }
}

/******************
 * ENDPOINTS
 ********************/

export async function getConnectSession() {
    return await fetchApi<GetConnectSession>('/connect/session', {});
}

export async function getIntegrations() {
    return await fetchApi<GetPublicListIntegrations>('/integrations', {});
}

export async function getProvider(params: GetPublicProvider['Params']) {
    return await fetchApi<GetPublicProvider>(`/providers/:provider`, { params });
}

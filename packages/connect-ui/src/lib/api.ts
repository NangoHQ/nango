/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
import type { ApiError, Endpoint, GetPublicListIntegrations, GetPublicProvider } from '@nangohq/types';

const API_HOSTNAME = 'http://localhost:3003'; // TODO: remove hardcoded value

function uriParamsReplacer(tpl: string, data: Record<string, any>) {
    let res = tpl;
    for (const [key, value] of Object.entries(data)) {
        res = res.replace(`:${key}`, value);
    }
    return res;
}

export async function fetchApi<T extends Endpoint<{ Path: any; Success: any; Method: any; Querystring?: any }>>(
    path: T['Path'],
    opts: (T['Method'] extends 'GET' ? { method?: T['Method'] } : { method: T['Method'] }) &
        (T['Body'] extends never ? { body?: undefined } : { body: T['Body'] }) &
        (T['Querystring'] extends never ? { query?: undefined } : { query: T['Querystring'] }) &
        (T['Params'] extends never ? { params?: never } : { params: T['Params'] }),
    method?: RequestInit['method']
): Promise<{ res: Response; json: T['Reply'] }> {
    const url = new URL(API_HOSTNAME);
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

    headers.append('Authorization', `Bearer ${import.meta.env.VITE_LOCAL_SECRET_KEY}`);

    const res = await fetch(url, {
        method: method || 'GET',
        body: opts?.body && JSON.stringify(opts.body),
        headers
    });

    let json: T | undefined;
    if (res.status !== 204) {
        json = (await res.json()) as T;
    }

    return { res, json: json || {} };
}

export function isError<TType extends Endpoint<{ Path: any; Success: any; Method: any }>['Reply']>(json: TType): json is Exclude<TType, { data: any }> {
    return json && 'error' in (json as any);
}

export class APIError extends Error {
    details;
    constructor(details: { res: Response; json: Record<string, any> | ApiError<any> }) {
        super('err');
        this.details = details;
    }
}

/******************
 * ENDPOINTS
 ********************/

export async function getIntegrations() {
    const { json, res } = await fetchApi<GetPublicListIntegrations>('/integrations', {});
    if (res.status !== 200 || isError(json)) {
        throw new APIError({ res, json });
    }

    return json;
}

export async function getProvider(params: GetPublicProvider['Params']) {
    const { json, res } = await fetchApi<GetPublicProvider>(`/providers/:provider`, { params });
    if (res.status !== 200 || isError(json)) {
        throw new APIError({ res, json });
    }

    return json;
}

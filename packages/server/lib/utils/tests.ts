import { inspect } from 'node:util';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { expect } from 'vitest';
import type { APIEndpoints, APIEndpointsPicker, APIEndpointsPickerWithPath, ApiError } from '@nangohq/types';
import { getServerPort } from '@nangohq/shared';

import { app } from '../routes.js';

function uriParamsReplacer(tpl: string, data: Record<string, any>) {
    return tpl.replace(/\$\(([^)]+)?\)/g, function (_, $2) {
        return data[$2];
    });
}

/**
 * Type safe API fetch
 */
export function apiFetch(baseUrl: string) {
    return async function apiFetch<
        TPath extends APIEndpoints['Path'],
        TEndpoint extends APIEndpointsPickerWithPath<TPath>,
        TMethod extends TEndpoint['Method'],
        TQuery extends TEndpoint['Querystring'],
        TBody extends TEndpoint['Body'],
        TParams extends TEndpoint['Params']
    >(
        path: TPath,
        { method, query, token, body, params }: { method?: TMethod; query?: TQuery; token?: string; body?: TBody; params?: TParams } = {}
    ): Promise<{ res: Response; json: APIEndpointsPicker<TMethod, TPath>['Reply'] }> {
        const search = new URLSearchParams(query);
        const url = new URL(`${baseUrl}${path}?${search.toString()}`);
        const headers = new Headers();

        if (token) {
            headers.append('Authorization', `Bearer ${token}`);
        }
        if (body) {
            headers.append('content-type', 'application/json');
        }
        const res = await fetch(params ? uriParamsReplacer(url.href, params) : url, {
            method: method || 'GET',
            headers,
            body: body ? JSON.stringify(body) : null
        });

        let json: any = null;
        if (res.status !== 204) {
            json = await res.json();
        }

        return { res, json: json || {} };
    };
}

/**
 * Assert API response is an error
 */
export function isError(json: any): asserts json is ApiError<any, any> {
    if (!('error' in json)) {
        console.log('isError', inspect(json, true, 100));
        throw new Error('Response is not an error');
    }
}

/**
 * Assert API response is a success
 */
export function isSuccess<TType extends Record<string, any>>(json: TType): asserts json is Exclude<TType, { error: any }> {
    if (json && 'error' in json) {
        console.log('isSuccess', inspect(json, true, 100));
        throw new Error('Response is not a success');
    }
}

/**
 * Check if an endpoint is protected by some auth
 */
export function shouldBeProtected({ res, json }: { res: Response; json: any }) {
    isError(json);
    expect(json).toStrictEqual({ error: 'Authentication failed. The request is missing the Authorization header.', payload: {}, type: 'missing_auth_header' });
    expect(res.status).toBe(401);
}

/**
 * Check if an endpoint requires the query params to be set
 */
export function shouldRequireQueryEnv({ res, json }: { res: Response; json: any }) {
    isError(json);
    expect(json).toStrictEqual({
        error: {
            code: 'invalid_query_params',
            errors: [{ code: 'invalid_type', message: 'Required', path: ['env'] }]
        }
    });
    expect(res.status).toBe(400);
}

/**
 * Run the API in the test
 */
export async function runServer(): Promise<{ server: Server; url: string; fetch: ReturnType<typeof apiFetch> }> {
    const server = createServer(app);
    return new Promise((resolve) => {
        const port = getServerPort();
        server.listen(port, () => {
            const url = `http://localhost:${port}`;
            resolve({ server, url, fetch: apiFetch(url) });
        });
    });
}

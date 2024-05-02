import { inspect } from 'node:util';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import { expect } from 'vitest';
import type { APIEndpoints, APIEndpointsPicker, APIEndpointsPickerWithPath, ApiError } from '@nangohq/types';

import { app } from '../routers.js';
import { getServerPort } from '@nangohq/shared';

export function apiFetch(baseUrl: string) {
    return async function apiFetch<
        TPath extends APIEndpoints['Path'],
        TEndpoint extends APIEndpointsPickerWithPath<TPath>,
        TMethod extends TEndpoint['Method'],
        TQuery extends TEndpoint['Querystring']
    >(
        path: TPath,
        { method, query }: { method?: TMethod; query?: TQuery } = {}
    ): Promise<{ res: Response; json: APIEndpointsPicker<TMethod, TPath>['Reply'] }> {
        const search = new URLSearchParams(query);
        const url = new URL(`${baseUrl}${path}?${search.toString()}`);
        const res = await fetch(url, {
            method: method || 'GET'
        });

        let json: any = null;
        if (res.status !== 204) {
            json = await res.json();
        }

        return { res, json: json || {} };
    };
}

export function isError(json: any): asserts json is ApiError<any, any> {
    if (!('error' in json)) {
        console.log('isError', inspect(json, true, 100));
        throw new Error('Response is not an error');
    }
}

export function shouldBeProtected({ res, json }: { res: Response; json: any }) {
    isError(json);
    expect(json).toStrictEqual({
        error: {
            code: '401_unauthorized'
        }
    });
    expect(res.status).toBe(401);
}

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

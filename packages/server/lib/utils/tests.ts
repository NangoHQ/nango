import { inspect } from 'node:util';
import type { Server } from 'node:http';
import { createServer } from 'node:http';
import express from 'express';
import { expect } from 'vitest';
import type { APIEndpoints, APIEndpointsPicker, APIEndpointsPickerWithPath } from '@nangohq/types';
import getPort from 'get-port';
import { migrateLogsMapping } from '@nangohq/logs';
import db, { multipleMigrations } from '@nangohq/database';
import { migrate as migrateKeystore } from '@nangohq/keystore';

import { router } from '../routes.js';

function uriParamsReplacer(tpl: string, data: Record<string, any>) {
    let res = tpl;
    for (const [key, value] of Object.entries(data)) {
        res = res.replace(`:${key}`, value);
    }
    return res;
}

/**
 * Type safe API fetch
 */
export function apiFetch(baseUrl: string) {
    return async function apiFetch<
        TPath extends APIEndpoints['Path'],
        TMethod extends APIEndpointsPickerWithPath<TPath>['Method'],
        TEndpoint extends APIEndpointsPicker<TMethod, TPath>
    >(
        path: TPath,
        {
            method,
            query,
            token,
            body,
            params
        }: { token?: string } & (TMethod extends 'GET' ? { method?: TMethod } : { method: TMethod }) &
            (TEndpoint['Querystring'] extends never ? { query?: never } : { query: TEndpoint['Querystring'] }) &
            (TEndpoint['Body'] extends never ? { body?: never } : { body: TEndpoint['Body'] }) &
            (TEndpoint['Params'] extends never ? { params?: never } : { params: TEndpoint['Params'] })
    ): Promise<{ res: Response; json: APIEndpointsPicker<TMethod, TPath>['Reply'] }> {
        const url = new URL(`${baseUrl}${path}`);
        if (query) {
            Object.entries(query).forEach(([name, value]) => {
                if (Array.isArray(value)) {
                    for (const el of value) {
                        url.searchParams.set(name, el);
                    }
                } else {
                    url.searchParams.set(name, value || '');
                }
            });
        }
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
export function isError<TType extends Record<string, any>>(
    json: TType extends { json: any } ? never : TType
): asserts json is Extract<TType extends { json: any } ? never : TType, { error: any }> {
    if (!('error' in json)) {
        console.log('isError', inspect(json, true, 100));
        throw new Error('Response is not an error');
    }
}

/**
 * Assert API response is a success
 */
export function isSuccess<TType extends Record<string, any>>(
    json: TType extends { json: any } ? never : TType
): asserts json is Exclude<TType extends { json: any } ? never : TType, { error: any }> {
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
    expect(json).toStrictEqual({
        error: { message: 'Authentication failed. The request is missing the Authorization header.', payload: {}, code: 'missing_auth_header' }
    });
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
    await multipleMigrations();
    await migrateLogsMapping();
    await migrateKeystore(db.knex);

    const server = createServer(express().use(router));
    const port = await getPort();
    return new Promise((resolve) => {
        server.listen(port, () => {
            const url = `http://localhost:${port}`;
            resolve({ server, url, fetch: apiFetch(url) });
        });
    });
}

/**
 * Get connect session token
 * @param api
 * @param env
 * @returns connect session token
 * @throws Error if no connect session token
 * @example const token = await getConnectSessionToken(api, env);
 */
export async function getConnectSessionToken(api: Awaited<ReturnType<typeof runServer>>, env: { secret_key: string }) {
    const endUserId = Math.random().toString(36).substring(7);
    const getSession = await fetch(`${api.url}/connect/sessions`, {
        method: 'POST',
        body: JSON.stringify({ end_user: { id: endUserId, email: `${endUserId}@domain.com` } }),
        headers: { Authorization: `Bearer ${env.secret_key}`, 'content-type': 'application/json' }
    });
    const {
        data: { token }
    } = (await getSession.json()) as { data: { token: string } };
    if (!token) throw new Error('No connect session token');
    return token;
}

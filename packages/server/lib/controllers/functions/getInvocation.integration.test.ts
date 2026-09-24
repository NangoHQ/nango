import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, NangoError, Orchestrator, seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

import type { ApiKeyScope } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/functions/invocations/:id';
const invocationId = '11111111-1111-4111-8111-111111111111';

async function seedAccount(scopes?: ApiKeyScope[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    if (scopes) {
        await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    }
    return seed;
}

async function createApiKeyWithScopes(seed: Awaited<ReturnType<typeof seedAccount>>, scopes: string[]) {
    const key = await customerKeyService.createApiKey(db.knex, {
        accountId: seed.account.id,
        environmentId: seed.env.id,
        displayName: `test-${randomUUID()}`,
        scopes
    });

    return key.unwrap();
}

describe(`GET ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'GET',
            params: { id: invocationId }
        });

        shouldBeProtected(res);
    });

    it('should reject requests without the invocations scope', async () => {
        const seed = await seedAccount();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:functions:invocations'
            }
        });
    });

    it('should validate request', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: 'not-uuid' }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_uri_params',
                errors: [
                    {
                        code: 'invalid_format',
                        message: 'Invalid UUID',
                        path: ['id']
                    }
                ]
            }
        });
    });

    it('should return not found when the invocation does not exist', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'not_found' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'not_found',
                message: `No invocation '${invocationId}' found`
            }
        });
    });

    it('should return accepted while the invocation is still running', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(202);
        expect(res.json).toStrictEqual({ id: invocationId, statusUrl: `/functions/invocations/${invocationId}` });
    });

    it('should return the function output', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'done', output: { echoed: 'test' } }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ echoed: 'test' });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ retryKey: invocationId, errorType: 'function_execution_failure' }));
    });

    it('should return a null output as a result, not as a missing invocation', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'done', output: null }));

        // not using api.fetch: it turns a falsy body into `{}`, which is exactly what we need to tell apart here
        const res = await fetch(`${api.url}/functions/invocations/${invocationId}`, {
            headers: { Authorization: `Bearer ${apiKey.secret}` }
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('null');
    });

    it('should return function_failed when the function failed', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Err(new NangoError('function_execution_failure', { error: 'boom' })));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(500);
        expect(res.json).toStrictEqual({
            error: {
                code: 'function_failed',
                message: 'The function failed with an error.'
            }
        });
    });

    it('should keep the status and code of non-function errors', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Err(new NangoError('script_http_error', { status: 404 })));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { id: invocationId }
        });

        expect(res.res.status).toBe(424);
        expect(res.json).toStrictEqual({
            error: {
                code: 'script_http_error',
                payload: { status: 404 }
            }
        });
    });
});

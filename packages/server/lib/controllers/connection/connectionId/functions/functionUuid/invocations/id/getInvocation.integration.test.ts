import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, functionConfigService, NangoError, Orchestrator, seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../../../../../../utils/tests.js';

import type { ApiKeyScope, DBFunctionConfigVersion, FunctionTriggerDefinition } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connections/:connectionId/functions/:functionUuid/invocations/:id';

function functionVersion(
    trigger: FunctionTriggerDefinition = { kind: 'http' }
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: 'Test function',
        file_location: 'functions/github/test-function',
        version: 'test-version',
        source: 'repo',
        trigger,
        requires: { connection: true, outbound: false, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: '#/definitions/Input',
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: {
            definitions: {
                Input: {
                    type: 'object',
                    properties: { value: { type: 'string' } },
                    required: ['value'],
                    additionalProperties: false
                }
            }
        }
    };
}

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

async function seedFunction(trigger?: FunctionTriggerDefinition) {
    const { apiKey, env } = await seedAccount(['environment:functions:invocations']);
    const integration = await seeders.createConfigSeed(env, 'github', 'github');
    const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: randomUUID() });
    await functionConfigService.upsert(db.knex, [
        {
            environmentId: env.id,
            integrationId: integration.unique_key,
            name: 'test-function',
            version: functionVersion(trigger)
        }
    ]);

    const config = await db.knex('function_configs').where({ environment_id: env.id, name: 'test-function' }).first<{ uuid: string }>();
    return { apiKey, connection, integration, env, functionUuid: config!.uuid };
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
        const invocationParams = { connectionId: randomUUID(), functionUuid: randomUUID() };
        const invocationId = randomUUID();

        const res = await api.fetch(endpoint, {
            method: 'GET',
            params: { ...invocationParams, id: invocationId }
        });

        shouldBeProtected(res);
    });

    it('should reject requests without the invocations scope', async () => {
        const invocationParams = { connectionId: randomUUID(), functionUuid: randomUUID() };
        const invocationId = randomUUID();

        const seed = await seedAccount();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
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
        const invocationParams = { connectionId: randomUUID(), functionUuid: randomUUID() };

        const { apiKey } = await seedAccount(['environment:functions:invocations']);

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: 'not-uuid' }
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

    it('should reject a function that does not exist in the environment', async () => {
        const { apiKey, connection } = await seedFunction();
        const functionUuid = randomUUID();
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id, functionUuid, id: randomUUID() }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({ error: { code: 'function_not_found', message: `Function '${functionUuid}' was not found` } });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should reject a connection that does not exist for the function integration', async () => {
        const { apiKey, functionUuid } = await seedFunction();
        const connectionId = randomUUID();
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId, functionUuid, id: randomUUID() }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({ error: { code: 'connection_not_found', message: `Connection '${connectionId}' was not found` } });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should reject a connection belonging to another integration', async () => {
        const { apiKey, env, functionUuid } = await seedFunction();
        const integration = await seeders.createConfigSeed(env, 'github-other', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: randomUUID() });
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id, functionUuid, id: randomUUID() }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: { code: 'connection_not_found', message: `Connection '${connection.connection_id}' was not found` }
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should reject a function belonging to another environment', async () => {
        const { connection, functionUuid } = await seedFunction();
        const { apiKey } = await seedAccount(['environment:functions:invocations']);
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { connectionId: connection.connection_id, functionUuid, id: randomUUID() }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({ error: { code: 'function_not_found', message: `Function '${functionUuid}' was not found` } });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should return not found when the invocation does not exist', async () => {
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'not_found' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
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
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        const invocationPath = `/connections/${invocationParams.connectionId}/functions/${invocationParams.functionUuid}/invocations`;
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'in_progress' }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
        });

        expect(res.res.status).toBe(202);
        expect(res.res.headers.get('X-Nango-Invocation-Id')).toBe(invocationId);
        expect(res.json).toStrictEqual({ id: invocationId, statusUrl: `${invocationPath}/${invocationId}` });
    });

    it('should return the function output', async () => {
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        const spy = vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'done', output: { echoed: 'test' } }));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ echoed: 'test' });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ retryKey: invocationId, errorType: 'function_execution_failure' }));
    });

    it('should return a null output as a result, not as a missing invocation', async () => {
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        const invocationPath = `/connections/${invocationParams.connectionId}/functions/${invocationParams.functionUuid}/invocations`;
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Ok({ state: 'done', output: null }));

        // not using api.fetch: it turns a falsy body into `{}`, which is exactly what we need to tell apart here
        const res = await fetch(`${api.url}${invocationPath}/${invocationId}`, {
            headers: { Authorization: `Bearer ${apiKey.secret}` }
        });

        expect(res.status).toBe(200);
        expect(await res.text()).toBe('null');
    });

    it('should return function_failed when the function failed', async () => {
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Err(new NangoError('function_execution_failure', { error: 'boom' })));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
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
        const invocationId = randomUUID();

        const { apiKey, connection, functionUuid } = await seedFunction();
        const invocationParams = { connectionId: connection.connection_id, functionUuid };
        vi.spyOn(Orchestrator.prototype, 'getOutput').mockResolvedValue(Err(new NangoError('script_http_error', { status: 404 })));

        const res = await api.fetch(endpoint, {
            method: 'GET',
            token: apiKey.secret,
            params: { ...invocationParams, id: invocationId }
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

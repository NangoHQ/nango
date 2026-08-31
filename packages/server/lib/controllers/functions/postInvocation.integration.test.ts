import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, functionConfigService, NangoError, Orchestrator, seeders } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

import type { ApiKeyScope, DBFunctionConfigVersion, FunctionTriggerDefinition } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/functions/invocations';

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
    const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: 'test-connection' });
    await functionConfigService.upsert(db.knex, {
        environmentId: env.id,
        integrationId: integration.unique_key,
        name: 'test-function',
        version: functionVersion(trigger)
    });

    return { apiKey, connection, integration, env };
}

describe(`POST ${endpoint}`, () => {
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
            method: 'POST',
            body: {
                integration_id: 'test',
                connection_id: 'test',
                name: 'test',
                input: {},
                invocation_type: 'no_wait'
            }
        });

        shouldBeProtected(res);
    });

    it('should reject requests without the invocations scope', async () => {
        const seed = await seedAccount();
        const apiKey = await createApiKeyWithScopes(seed, ['environment:functions:dryrun']);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'test',
                connection_id: 'test',
                name: 'test',
                input: {},
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'forbidden',
                message: 'Insufficient scope. Required: environment:functions:invocations'
            }
        });
    });

    it('should reject empty invocation identifiers', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: '',
                connection_id: '',
                name: '',
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toEqual({
            error: {
                code: 'invalid_body',
                errors: expect.arrayContaining([
                    expect.objectContaining({ path: ['integration_id'] }),
                    expect.objectContaining({ path: ['connection_id'] }),
                    expect.objectContaining({ path: ['name'] })
                ])
            }
        });
    });

    it('should error when the connection is not found', async () => {
        const { apiKey } = await seedAccount(['environment:functions:invocations']);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: 'github',
                connection_id: 'missing-connection',
                name: 'test-function',
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'connection_not_found',
                message: "Connection 'missing-connection' was not found for integration 'github'"
            }
        });
    });

    it('should return an error when the function is not found', async () => {
        const { apiKey, env } = await seedAccount(['environment:functions:invocations']);
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: 'test-connection' });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'missing-function',
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'function_not_found',
                message: "Function 'missing-function' was not found"
            }
        });
    });

    it('should return forbidden when the function is disabled', async () => {
        const { apiKey, connection, integration, env } = await seedFunction();
        await db.knex('function_configs').where({ environment_id: env.id, name: 'test-function' }).update({ enabled: false });

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(403);
        expect(res.json).toStrictEqual({
            error: {
                code: 'function_disabled',
                message: "Function 'test-function' is disabled"
            }
        });
    });

    it('should return validation errors for invalid function input', async () => {
        const { apiKey, connection, integration } = await seedFunction();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 42 },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'validation_error',
                message: 'invalid_function_input',
                errors: [
                    {
                        code: 'type',
                        message: 'must be string',
                        path: ['value']
                    }
                ]
            }
        });
    });

    it('should schedule an orchestrator task for no_wait invocations', async () => {
        const { apiKey, connection, integration } = await seedFunction();
        const spy = vi
            .spyOn(Orchestrator.prototype, 'invokeFunction')
            .mockResolvedValue(Ok({ id: 'retry-key-1', statusUrl: '/functions/invocations/retry-key-1' }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(202);
        expect(res.res.headers.get('location')).toBe('/functions/invocations/retry-key-1');
        expect(res.json).toStrictEqual({ id: 'retry-key-1', statusUrl: '/functions/invocations/retry-key-1' });
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                functionName: 'test-function',
                trigger: expect.objectContaining({
                    kind: 'http',
                    input: { value: 'test' },
                    request: expect.objectContaining({ method: 'POST', path: endpoint, body: { value: 'test' } })
                }),
                async: true,
                maxConcurrency: 0 // seeded function has perConnection: 'max'
            })
        );
    });

    it('should deliver the declared trigger when manually invoking a scheduled function', async () => {
        const { apiKey, connection, integration } = await seedFunction({ kind: 'schedule', frequency: 'every hour' });
        const spy = vi
            .spyOn(Orchestrator.prototype, 'invokeFunction')
            .mockResolvedValue(Ok({ id: 'retry-key-1', statusUrl: '/functions/invocations/retry-key-1' }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(202);
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                trigger: {
                    kind: 'schedule',
                    input: null,
                    connection: { connectionId: connection.connection_id, integrationId: integration.unique_key }
                }
            })
        );
    });

    it('should reject event-triggered functions with no configured events', async () => {
        const { apiKey, connection, integration } = await seedFunction({ kind: 'event', events: [] });
        const spy = vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: null }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(400);
        expect(res.json).toStrictEqual({
            error: {
                code: 'invalid_invocation',
                message: 'Event-triggered function has no configured events'
            }
        });
        expect(spy).not.toHaveBeenCalled();
    });

    it('should return the function output for wait invocations', async () => {
        const { apiKey, connection, integration } = await seedFunction();
        const spy = vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: { echoed: 'test' } }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'wait'
            }
        });

        expect(res.res.status).toBe(200);
        expect(res.json).toStrictEqual({ echoed: 'test' });
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ async: false }));
    });

    it('should serialize invocations when the function limits concurrency per connection', async () => {
        const { apiKey, connection, integration, env } = await seedFunction();
        await db
            .knex('function_config_versions')
            .whereIn('function_config_id', db.knex('function_configs').select('id').where({ environment_id: env.id, name: 'test-function' }))
            .update({ limits: { concurrency: { perConnection: 1 } } });
        const spy = vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: null }));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'wait'
            }
        });

        expect(res.res.status).toBe(200);
        expect(spy).toHaveBeenCalledWith(expect.objectContaining({ maxConcurrency: 1 }));
    });

    it('should return an error when the invocation fails', async () => {
        const { apiKey, connection, integration } = await seedFunction();
        vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Err(new NangoError('function_failure')));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'no_wait'
            }
        });

        expect(res.res.status).toBe(500);
        expect(res.json).toStrictEqual({
            error: {
                code: 'function_failed',
                message: 'Failed to invoke the function'
            }
        });
    });

    it('should preserve script errors returned by the function', async () => {
        const { apiKey, connection, integration } = await seedFunction();
        vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Err(new NangoError('script_http_error', { error: 'upstream failed' })));

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'wait'
            }
        });

        expect(res.res.status).toBe(424);
        expect(res.json).toStrictEqual({
            error: {
                code: 'script_http_error',
                payload: { error: 'upstream failed' }
            }
        });
    });
});

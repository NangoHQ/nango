import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { customerKeyService, functionConfigService, seeders } from '@nangohq/shared';

import { runServer, shouldBeProtected } from '../../utils/tests.js';

import type { ApiKeyScope, DBFunctionConfigVersion } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/functions/invocations';

function functionVersion(): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: 'Test function',
        file_location: 'functions/github/test-function',
        version: 'test-version',
        source: 'repo',
        trigger: { kind: 'http' },
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

async function seedFunction() {
    const { apiKey, env } = await seedAccount(['environment:functions:invocations']);
    const integration = await seeders.createConfigSeed(env, 'github', 'github');
    const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key, connectionId: 'test-connection' });
    await functionConfigService.upsert(db.knex, {
        environmentId: env.id,
        integrationId: integration.unique_key,
        name: 'test-function',
        version: functionVersion()
    });

    return { apiKey, connection, integration };
}

describe(`POST ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            body: {
                integration_id: 'test',
                connection_id: 'test',
                name: 'test',
                input: {},
                invocation_type: 'Async'
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
                invocation_type: 'Async'
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
                invocation_type: 'Async'
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
                invocation_type: 'Async'
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
                invocation_type: 'Async'
            }
        });

        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual({
            error: {
                code: 'unknown_function',
                message: "Function 'missing-function' was not found"
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
                invocation_type: 'Async'
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

    it('should return not implemented', async () => {
        const { apiKey, connection, integration } = await seedFunction();

        const res = await api.fetch(endpoint, {
            method: 'POST',
            token: apiKey.secret,
            body: {
                integration_id: integration.unique_key,
                connection_id: connection.connection_id,
                name: 'test-function',
                input: { value: 'test' },
                invocation_type: 'Async'
            }
        });

        expect(res.res.status).toBe(501);
        expect(res.json).toStrictEqual({
            error: {
                code: 'not_implemented',
                message: 'Function invocation is not implemented yet'
            }
        });
    });
});

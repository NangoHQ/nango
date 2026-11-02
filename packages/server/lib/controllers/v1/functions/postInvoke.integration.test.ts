import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { envs } from '@nangohq/logs';
import { functionConfigService, NangoError, Orchestrator, seeders, syncManager } from '@nangohq/shared';
import { Err, Ok } from '@nangohq/utils';

import { authenticateUser, isError, runServer, shouldBeProtected } from '../../../utils/tests.js';

import type { DBFunctionConfigVersion, FunctionTriggerDefinition, PostInternalInvokeFunction } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/api/v1/functions/invoke';

const mockRunSyncCommand = vi.spyOn(syncManager, 'runSyncCommand').mockResolvedValue({
    success: true,
    response: true,
    error: null
});

async function seedTool(trigger: FunctionTriggerDefinition = { kind: 'http' }) {
    const seed = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
    const integration = await seeders.createConfigSeed(seed.env, 'github', 'github');
    const connection = await seeders.createConnectionSeed({ env: seed.env, provider: integration.unique_key, connectionId: 'conn1' });
    const version = {
        description: 'Test tool',
        tags: {},
        file_location: 'github/functions/test-tool.js',
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
            definitions: { Input: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false } }
        }
    } satisfies Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;
    const [fn] = (
        await functionConfigService.upsert(db.knex, [{ environmentId: seed.env.id, integrationId: integration.unique_key, name: 'test-tool', version }])
    ).unwrap();
    const session = await authenticateUser(api, seed.user);
    const body: PostInternalInvokeFunction['Body'] = {
        type: 'tool',
        function_name: 'test-tool',
        provider_config_key: integration.unique_key,
        connection_id: connection.connection_id,
        input: { value: 'hello' }
    };
    return { ...seed, integration, connection, fn: fn!, version, session, body };
}

describe(`POST ${endpoint}`, () => {
    const logsEnabled = envs.NANGO_LOGS_ENABLED;

    beforeAll(async () => {
        api = await runServer();
        envs.NANGO_LOGS_ENABLED = false;
    });
    afterAll(() => {
        envs.NANGO_LOGS_ENABLED = logsEnabled;
        api.server.close();
        // Module-level spies live on the shared syncManager, so drop them for the next file.
        vi.restoreAllMocks();
    });

    it.each(['sync', 'action', 'tool'] as const)('should protect %s execution', async (type) => {
        const res = await api.fetch(endpoint, {
            method: 'POST',
            query: { env: 'dev' },
            body: { type, function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' }
        });

        shouldBeProtected(res);
    });

    it('should require the env query param', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(endpoint, {
            method: 'POST',
            // @ts-expect-error intentionally omitting required query
            query: {},
            body: { type: 'sync', function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
            session
        });

        isError(res.json);
        // sessionAuth middleware validates env and returns 401 for missing/invalid env
        expect(res.res.status).toBe(401);
        expect(res.json.error.code).toBe('invalid_env');
    });

    describe('body validation', () => {
        it('should return 400 when type is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when type is invalid', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'webhook', function_name: 'sync1', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when function_name is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'sync', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });

        it('should return 400 when provider_config_key is missing', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                // @ts-expect-error intentionally invalid body
                body: { type: 'sync', function_name: 'sync1', connection_id: 'conn1' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('invalid_body');
        });
    });

    describe('sync', () => {
        it('should call syncManager.runSyncCommand with RUN and correct identifiers', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                body: { type: 'sync', function_name: 'my-sync', provider_config_key: 'test-key', connection_id: 'conn1' },
                session
            });

            expect(res.res.status).toBe(200);
            expect(mockRunSyncCommand).toHaveBeenCalledWith(
                expect.objectContaining({
                    command: 'RUN',
                    providerConfigKey: 'test-key',
                    connectionId: 'conn1',
                    syncIdentifiers: [{ syncName: 'my-sync', syncVariant: 'base' }]
                })
            );
        });
    });

    describe('tool', () => {
        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('requires execution permission in production', async () => {
            const seed = await seedTool();
            await db.knex('_nango_environments').where({ id: seed.env.id }).update({ is_production: true });
            await db.knex('_nango_users').where({ id: seed.user.id }).update({ role: 'development_full_access' });
            const session = await authenticateUser(api, seed.user);
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction');
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session });
            expect(res.res.status).toBe(403);
            expect(invoke).not.toHaveBeenCalled();
        });

        it('uses the selected integration when connection IDs are reused', async () => {
            const seed = await seedTool();
            await seeders.createConfigSeed(seed.env, 'other-github', 'github');
            const otherConnection = await seeders.createConnectionSeed({
                env: seed.env,
                provider: 'other-github',
                connectionId: seed.connection.connection_id
            });
            const [otherFn] = (
                await functionConfigService.upsert(db.knex, [
                    {
                        environmentId: seed.env.id,
                        integrationId: 'other-github',
                        name: seed.body.function_name,
                        version: seed.version
                    }
                ])
            ).unwrap();
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: { result: 'other' } }));
            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                body: { ...seed.body, provider_config_key: 'other-github' },
                session: seed.session
            });
            expect(res.res.status).toBe(200);
            expect(invoke).toHaveBeenCalledWith(
                expect.objectContaining({
                    functionUuid: otherFn!.config.uuid,
                    connection: expect.objectContaining({ id: otherConnection.id })
                })
            );
        });

        it('invokes an HTTP function synchronously and returns its output', async () => {
            const seed = await seedTool();
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Ok({ data: { result: 'hello' } }));
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session: seed.session });
            expect(res.res.status).toBe(200);
            expect(res.json).toEqual({ result: 'hello' });
            expect(invoke).toHaveBeenCalledWith(
                expect.objectContaining({
                    functionUuid: seed.fn.config.uuid,
                    connection: expect.objectContaining({ id: seed.connection.id }),
                    async: false,
                    trigger: expect.objectContaining({
                        kind: 'http',
                        input: seed.body.input,
                        request: expect.objectContaining({ method: 'POST', body: seed.body.input })
                    })
                })
            );
        });

        it.each([
            ['unknown function', { function_name: 'unknown' }, 'function_not_found', 404],
            ['wrong integration', { provider_config_key: 'other' }, 'function_not_found', 404],
            ['unknown connection', { connection_id: 'unknown' }, 'connection_not_found', 404],
            ['invalid input', { input: { value: 123 } }, 'validation_error', 400]
        ] as const)('rejects %s without executing', async (_label, override, code, status) => {
            const seed = await seedTool();
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction');
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: { ...seed.body, ...override }, session: seed.session });
            expect(res.res.status).toBe(status);
            isError(res.json);
            expect(res.json.error.code).toBe(code);
            expect(invoke).not.toHaveBeenCalled();
        });

        it('rejects a function from another environment', async () => {
            const seed = await seedTool();
            const other = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, other.user);
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction');
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session });
            expect(res.res.status).toBe(404);
            expect(invoke).not.toHaveBeenCalled();
        });

        it('rejects a disabled tool', async () => {
            const seed = await seedTool();
            await db.knex('function_configs').where({ id: seed.fn.config.id }).update({ enabled: false });
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction');
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session: seed.session });
            expect(res.res.status).toBe(403);
            isError(res.json);
            expect(res.json.error.code).toBe('function_disabled');
            expect(invoke).not.toHaveBeenCalled();
        });

        it('does not invoke a function without an HTTP trigger', async () => {
            const seed = await seedTool({ kind: 'none' });
            const invoke = vi.spyOn(Orchestrator.prototype, 'invokeFunction');
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session: seed.session });
            expect(res.res.status).toBe(404);
            expect(invoke).not.toHaveBeenCalled();
        });

        it('returns native execution failures', async () => {
            const seed = await seedTool();
            vi.spyOn(Orchestrator.prototype, 'invokeFunction').mockResolvedValue(Err(new NangoError('function_execution_failure')));
            const res = await api.fetch(endpoint, { method: 'POST', query: { env: 'dev' }, body: seed.body, session: seed.session });
            expect(res.res.status).toBe(500);
            isError(res.json);
            expect(res.json.error.code).toBe('function_failed');
        });
    });

    describe('action', () => {
        it('should return 400 for unknown connection', async () => {
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const res = await api.fetch(endpoint, {
                method: 'POST',
                query: { env: 'dev' },
                body: { type: 'action', function_name: 'my-action', provider_config_key: 'test-key', connection_id: 'nonexistent' },
                session
            });

            isError(res.json);
            expect(res.res.status).toBe(400);
            expect(res.json.error.code).toBe('unknown_connection');
        });
    });
});

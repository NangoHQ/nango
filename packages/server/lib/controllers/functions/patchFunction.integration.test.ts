import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, functionInstanceService, Orchestrator, seeders } from '@nangohq/shared';
import { Ok } from '@nangohq/utils';

import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { ApiKeyScope, DBFunctionConfigVersion, FunctionTriggerDefinition, GetFunctionResponse } from '@nangohq/types';

const route = '/functions/:uuid';
let api: Awaited<ReturnType<typeof runServer>>;

function functionVersion(
    trigger: FunctionTriggerDefinition = { kind: 'http' }
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: 'Fetch an issue',
        file_location: 'github/functions/fetchIssue.js',
        version: 'test-version',
        source: 'repo',
        trigger,
        requires: { connection: true, outbound: false, invoke: false },
        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
        limits: { concurrency: { perConnection: 'max' } },
        input_schema_ref: null,
        output_schema_ref: null,
        model_schema_refs: [],
        metadata_schema_ref: null,
        checkpoint_schema_ref: null,
        json_schema: {}
    };
}

async function seedAccount(scopes?: ApiKeyScope[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    if (scopes) {
        await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    }
    return seed;
}

describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('requires authentication and the update scope', async () => {
        shouldBeProtected(await api.fetch(route, { method: 'PATCH', params: { uuid: randomUUID() }, body: { state: 'disabled' } }));

        const { apiKey } = await seedAccount(['environment:functions:read']);
        const response = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: randomUUID() }, body: { state: 'disabled' } });
        expect(response.res.status).toBe(403);
    });

    it('validates the UUID, the body, and query parameters', async () => {
        const { apiKey } = await seedAccount(['environment:functions:update']);

        const invalidUuid = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: '123' }, body: { state: 'disabled' } });
        expect(invalidUuid.res.status).toBe(400);
        isError(invalidUuid.json);
        expect(invalidUuid.json.error.code).toBe('invalid_uri_params');

        const missingState = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: randomUUID() }, body: {} as never });
        expect(missingState.res.status).toBe(400);
        isError(missingState.json);
        expect(missingState.json.error.code).toBe('invalid_body');

        const badState = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: randomUUID() }, body: { state: 'paused' } as never });
        expect(badState.res.status).toBe(400);
        isError(badState.json);
        expect(badState.json.error.code).toBe('invalid_body');

        const query = await api.fetch(route, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { uuid: randomUUID() },
            body: { state: 'disabled' },
            query: { extra: 'x' } as never
        });
        expect(query.res.status).toBe(400);
        isError(query.json);
        expect(query.json.error.code).toBe('invalid_query_params');
    });

    it('returns 404 if the function does not exist or belongs to another environment', async () => {
        const { apiKey } = await seedAccount(['environment:functions:update']);
        const missing = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: randomUUID() }, body: { state: 'disabled' } });
        expect(missing.res.status).toBe(404);
        isError(missing.json);
        expect(missing.json.error.code).toBe('not_found');

        const other = await seedAccount(['environment:functions:update']);
        await seeders.createConfigSeed(other.env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: other.env.id, integrationId: 'github-123', name: 'fetchIssue', version: functionVersion() }
            ])
        ).unwrap();

        const foreign = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: fn!.config.uuid }, body: { state: 'disabled' } });
        expect(foreign.res.status).toBe(404);
    });

    it('disables then enables a function', async () => {
        const { apiKey, env } = await seedAccount(['environment:functions:update']);
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version: functionVersion() }
            ])
        ).unwrap();

        const disabled = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: fn!.config.uuid }, body: { state: 'disabled' } });
        expect(disabled.res.status).toBe(200);
        expect(disabled.json).toMatchObject({ uuid: fn!.config.uuid, name: 'fetchIssue', state: 'disabled' });

        const enabled = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: fn!.config.uuid }, body: { state: 'enabled' } });
        expect(enabled.res.status).toBe(200);
        expect(enabled.json).toMatchObject({ uuid: fn!.config.uuid, state: 'enabled' });
        expect(Date.parse((enabled.json as GetFunctionResponse).updated_at)).toBeGreaterThan(Date.parse((disabled.json as GetFunctionResponse).updated_at));
    });

    it('disables a scheduled function', async () => {
        const { apiKey, env } = await seedAccount(['environment:functions:update']);
        const integration = await seeders.createConfigSeed(env, 'github-123', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: integration.unique_key });
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: env.id,
                    integrationId: 'github-123',
                    name: 'fetchIssue',
                    version: functionVersion({ kind: 'schedule', frequency: 'every hour' })
                }
            ])
        ).unwrap();
        const instances = (
            await functionInstanceService.upsert(db.knex, [
                { function_config_id: fn!.config.id, nango_connection_id: connection.id, name: 'fetchIssue', variant: 'base', frequency: null },
                { function_config_id: fn!.config.id, nango_connection_id: connection.id, name: 'fetchIssue', variant: 'canary', frequency: 'every day' }
            ])
        ).unwrap();
        const deleteFunctionSchedules = vi.spyOn(Orchestrator.prototype, 'deleteFunctionSchedules').mockResolvedValue(Ok(undefined));

        const res = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: fn!.config.uuid }, body: { state: 'disabled' } });

        expect(res.res.status).toBe(200);
        expect(res.json).toMatchObject({ state: 'disabled' });
        expect(deleteFunctionSchedules).toHaveBeenCalledWith({ environmentId: env.id, instanceIds: instances.map((instance) => instance.id) });
        const after = (await functionInstanceService.search(db.knex, { functionConfigIds: [fn!.config.id] })).unwrap();
        expect(after).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ variant: 'base', enabled: false, deleted_at: null }),
                expect.objectContaining({ variant: 'canary', enabled: false, deleted_at: null })
            ])
        );

        deleteFunctionSchedules.mockRestore();

        // Re-enabling restores base only: variants stays disabled and unscheduled.
        const scheduleFunctions = vi.spyOn(Orchestrator.prototype, 'scheduleFunctions').mockResolvedValue(Ok(undefined));
        const enabled = await api.fetch(route, { method: 'PATCH', token: apiKey.secret, params: { uuid: fn!.config.uuid }, body: { state: 'enabled' } });

        expect(enabled.res.status).toBe(200);
        expect(enabled.json).toMatchObject({ state: 'enabled' });
        expect(scheduleFunctions).toHaveBeenCalledWith([expect.objectContaining({ instance: expect.objectContaining({ variant: 'base' }) })]);
        const restored = (await functionInstanceService.search(db.knex, { functionConfigIds: [fn!.config.id] })).unwrap();
        expect(restored).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ variant: 'base', enabled: true }),
                expect.objectContaining({ variant: 'canary', enabled: false })
            ])
        );
    });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBFunctionConfigVersion, FunctionTriggerDefinition } from '@nangohq/types';

const route = '/functions';
let api: Awaited<ReturnType<typeof runServer>>;

function encodeCursor(id: number): string {
    return Buffer.from(String(id), 'utf8').toString('base64url');
}

function version(
    trigger: FunctionTriggerDefinition = { kind: 'http' }
): Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'> {
    return {
        description: `Function ${trigger.kind}`,
        file_location: `functions/${trigger.kind}`,
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

async function disable(configId: number): Promise<void> {
    await db.knex('function_configs').where({ id: configId }).update({ enabled: false });
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('requires authentication and the list scope', async () => {
        shouldBeProtected(await api.fetch(route, { method: 'GET', query: {} }));

        const { apiKey } = await seeders.seedAccountEnvAndUser();
        await db
            .knex('customer_keys')
            .where({ id: apiKey.id })
            .update({ scopes: ['environment:functions:read'] });
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: {} });
        expect(response.res.status).toBe(403);
    });

    it('validates the querystring', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const unknown = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { foo: 'bar' } as never });
        expect(unknown.res.status).toBe(400);
        isError(unknown.json);
        expect(unknown.json.error.code).toBe('invalid_query_params');

        const state = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { state: 'on' } as never });
        expect(state.res.status).toBe(400);
        isError(state.json);
        expect(state.json.error.code).toBe('invalid_query_params');

        const triggerKind = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { 'trigger.kind': 'kafka' } as never });
        expect(triggerKind.res.status).toBe(400);
        isError(triggerKind.json);
        expect(triggerKind.json.error.code).toBe('invalid_query_params');

        const cursor = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { cursor: 'not-a-cursor' } });
        expect(cursor.res.status).toBe(400);
        isError(cursor.json);
        expect(cursor.json.error.code).toBe('invalid_query_params');

        const limit = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { limit: 1000 } });
        expect(limit.res.status).toBe(400);
        isError(limit.json);
        expect(limit.json.error.code).toBe('invalid_query_params');
    });

    it('returns an empty page', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: {} });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({ data: [], next_cursor: null });
    });

    it('lists functions and filters by integration, provider, state and trigger.kind', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        await seeders.createConfigSeed(env, 'stripe-123', 'stripe');
        const configs = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: env.id, integrationId: 'github-123', name: 'fetchIssues', version: version({ kind: 'http', subscriptions: ['push'] }) },
                { environmentId: env.id, integrationId: 'github-123', name: 'nightly', version: version({ kind: 'schedule', frequency: 'every day' }) },
                { environmentId: env.id, integrationId: 'stripe-123', name: 'createCharge', version: version({ kind: 'http' }) },
                { environmentId: env.id, integrationId: 'stripe-123', name: 'disabledOne', version: version({ kind: 'none' }) }
            ])
        ).unwrap();
        await disable(configs[3]!.config.id);

        const all = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: {} });
        expect(all.res.status).toBe(200);
        isSuccess(all.json);
        expect(all.json.data.map((fn) => fn.name)).toEqual(['fetchIssues', 'nightly', 'createCharge', 'disabledOne']);
        expect(all.json.next_cursor).toBeNull();
        expect(all.json.data[0]).toMatchObject({
            uuid: configs[0]!.config.uuid,
            integration_id: 'github-123',
            provider: 'github',
            name: 'fetchIssues',
            description: 'Function http',
            state: 'enabled',
            source: 'repo',
            trigger: { kind: 'http', subscriptions: ['push'] }
        });

        const byIntegration = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { integration: 'github-123' } });
        isSuccess(byIntegration.json);
        expect(byIntegration.json.data.map((fn) => fn.name)).toEqual(['fetchIssues', 'nightly']);

        const byProvider = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { provider: 'stripe' } });
        isSuccess(byProvider.json);
        expect(byProvider.json.data.map((fn) => fn.name)).toEqual(['createCharge', 'disabledOne']);

        const byState = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { state: 'disabled' } });
        isSuccess(byState.json);
        expect(byState.json.data.map((fn) => fn.name)).toEqual(['disabledOne']);

        const byTriggerKind = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { 'trigger.kind': 'http' } });
        isSuccess(byTriggerKind.json);
        expect(byTriggerKind.json.data.map((fn) => fn.name)).toEqual(['fetchIssues', 'createCharge']);

        const combined = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            query: { integration: 'github-123', provider: 'github', state: 'enabled', 'trigger.kind': 'http' }
        });
        isSuccess(combined.json);
        expect(combined.json.data.map((fn) => fn.name)).toEqual(['fetchIssues']);
    });

    it('paginates with a cursor', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const configs = (
            await functionConfigService.upsert(db.knex, [
                { environmentId: env.id, integrationId: 'github-123', name: 'first', version: version() },
                { environmentId: env.id, integrationId: 'github-123', name: 'second', version: version() },
                { environmentId: env.id, integrationId: 'github-123', name: 'third', version: version() }
            ])
        ).unwrap();

        const page1 = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { limit: 2 } });
        expect(page1.res.status).toBe(200);
        isSuccess(page1.json);
        expect(page1.json.data.map((fn) => fn.name)).toEqual(['first', 'second']);
        expect(page1.json.next_cursor).toStrictEqual(encodeCursor(configs[1]!.config.id));

        const page2 = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { limit: 2, cursor: page1.json.next_cursor! } });
        isSuccess(page2.json);
        expect(page2.json.data.map((fn) => fn.name)).toEqual(['third']);
        expect(page2.json.next_cursor).toBeNull();

        const pastEnd = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { limit: 2, cursor: encodeCursor(configs[2]!.config.id) } });
        isSuccess(pastEnd.json);
        expect(pastEnd.json.data).toStrictEqual([]);
        expect(pastEnd.json.next_cursor).toBeNull();

        const overshot = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { limit: 1, cursor: encodeCursor(999999999) } });
        isSuccess(overshot.json);
        expect(overshot.json.data).toStrictEqual([]);
        expect(overshot.json.next_cursor).toBeNull();
    });

    it('does not leak functions from another environment', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        const { apiKey: otherApiKey, env: otherEnv } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        await seeders.createConfigSeed(otherEnv, 'github-123', 'github');
        await functionConfigService.upsert(db.knex, [
            { environmentId: env.id, integrationId: 'github-123', name: 'mine', version: version() },
            { environmentId: otherEnv.id, integrationId: 'github-123', name: 'theirs', version: version() }
        ]);

        const response = await api.fetch(route, { method: 'GET', token: otherApiKey.secret, query: {} });
        isSuccess(response.json);
        expect(response.json.data.map((fn) => fn.name)).toEqual(['theirs']);

        const mine = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: {} });
        isSuccess(mine.json);
        expect(mine.json.data.map((fn) => fn.name)).toEqual(['mine']);
    });
});

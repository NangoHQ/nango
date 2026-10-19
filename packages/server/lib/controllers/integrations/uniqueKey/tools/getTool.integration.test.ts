import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import { getFlags } from '@nangohq/feature-flags';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBFunctionConfigVersion, DBSyncConfig } from '@nangohq/types';

const route = '/integrations/:uniqueKey/tools/:name';
let api: Awaited<ReturnType<typeof runServer>>;

async function seedAction() {
    const seed = await seeders.seedAccountEnvAndUser();
    const integration = await seeders.createConfigSeed(seed.env, 'github-123', 'github');
    await db.knex.from<DBSyncConfig>('_nango_sync_configs').insert({
        environment_id: seed.env.id,
        nango_config_id: integration.id!,
        sync_name: 'fetchIssue',
        type: 'action',
        file_location: 'file_location',
        version: '0.0.1',
        source: 'repo',
        runs: null,
        track_deletes: false,
        auto_start: false,
        webhook_subscriptions: [],
        models: ['Issue'],
        input: 'IssueInput',
        models_json_schema: {
            definitions: {
                IssueInput: { type: 'object', properties: { id: { type: 'string' } } },
                Issue: { type: 'object', properties: { title: { type: 'string' } } }
            }
        },
        metadata: { description: 'Legacy action', scopes: ['repo'] },
        active: true,
        enabled: true,
        deleted: false,
        deleted_at: null
    });
    return seed;
}

const version = {
    description: 'Fetch an issue',
    tags: { instructions: 'Use with care', required_scopes: ['repo', 'issues:write'], category: 'crm', entities: ['contacts', 'companies'] },
    file_location: 'github/functions/fetchIssue.js',
    version: 'test-version',
    source: 'repo',
    trigger: { kind: 'http' },
    requires: { connection: true, outbound: false, invoke: false },
    capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
    limits: { concurrency: { perConnection: 'max' } },
    input_schema_ref: '#/definitions/FunctionInput_github_fetchIssue',
    output_schema_ref: '#/definitions/FunctionOutput_github_fetchIssue',
    model_schema_refs: [],
    metadata_schema_ref: null,
    checkpoint_schema_ref: null,
    json_schema: {
        definitions: {
            FunctionInput_github_fetchIssue: { type: 'object', properties: { id: { type: 'string' } } },
            FunctionOutput_github_fetchIssue: { type: 'object', properties: { title: { type: 'string' } } }
        }
    }
} satisfies Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
        vi.spyOn(getFlags(), 'hasCatalogTools').mockResolvedValue(false);
    });

    afterAll(() => {
        vi.restoreAllMocks();
        api.server.close();
    });

    it('falls back to an action', async () => {
        const { apiKey } = await seedAction();
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });

        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({
            uuid: null,
            integration_id: 'github-123',
            provider: 'github',
            name: 'fetchIssue',
            description: 'Legacy action',
            input_json_schema: {
                $ref: '#/definitions/IssueInput',
                definitions: { IssueInput: { type: 'object', properties: { id: { type: 'string' } } } }
            },
            output_json_schema: {
                $ref: '#/definitions/Issue',
                definitions: { Issue: { type: 'object', properties: { title: { type: 'string' } } } }
            },
            source: 'repo',
            meta: { tags: {}, required_scopes: ['repo'] }
        });
    });

    it('prefers a function over an action with the same name', async () => {
        const { apiKey, env } = await seedAction();
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(200);
        expect(response.json).toMatchObject({ uuid: fn!.config.uuid, description: version.description });
    });

    it.each(['disabled', 'scheduled'] as const)('falls back to an action when the function is %s', async (state) => {
        const { apiKey, env } = await seedAction();
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: env.id,
                    integrationId: 'github-123',
                    name: 'fetchIssue',
                    version: state === 'scheduled' ? { ...version, trigger: { kind: 'schedule', frequency: '0 * * * *' } } : version
                }
            ])
        ).unwrap();
        if (state === 'disabled') {
            await db.knex('function_configs').where({ id: fn!.config.id }).update({ enabled: false });
        }

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(200);
        expect(response.json).toMatchObject({ uuid: null, description: 'Legacy action' });
    });

    it('requires authentication and the read scope', async () => {
        shouldBeProtected(await api.fetch(route, { method: 'GET', params: { uniqueKey: 'github-123', name: 'fetchIssue' } }));

        const { apiKey } = await seeders.seedAccountEnvAndUser();
        await db
            .knex('customer_keys')
            .where({ id: apiKey.id })
            .update({ scopes: ['environment:functions:list'] });
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(403);
    });

    it('validates the params and rejects query parameters', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const invalid = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'not a name' } });
        expect(invalid.res.status).toBe(400);
        isError(invalid.json);
        expect(invalid.json.error.code).toBe('invalid_uri_params');

        const query = await api.fetch(route, {
            method: 'GET',
            token: apiKey.secret,
            params: { uniqueKey: 'github-123', name: 'fetchIssue' },
            query: { extra: 'x' } as never
        });
        expect(query.res.status).toBe(400);
        isError(query.json);
        expect(query.json.error.code).toBe('invalid_query_params');
    });

    it('returns a tool with resolved schemas and meta', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();
        expect(fn).toBeDefined();

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({
            uuid: fn!.config.uuid,
            integration_id: 'github-123',
            provider: 'github',
            name: 'fetchIssue',
            description: 'Fetch an issue',
            input_json_schema: {
                $ref: '#/definitions/FunctionInput_github_fetchIssue',
                definitions: { FunctionInput_github_fetchIssue: version.json_schema.definitions.FunctionInput_github_fetchIssue }
            },
            output_json_schema: {
                $ref: '#/definitions/FunctionOutput_github_fetchIssue',
                definitions: { FunctionOutput_github_fetchIssue: version.json_schema.definitions.FunctionOutput_github_fetchIssue }
            },
            source: 'repo',
            meta: {
                instructions: 'Use with care',
                required_scopes: ['repo', 'issues:write'],
                tags: { category: 'crm', entities: ['contacts', 'companies'] }
            }
        });
    });

    it('returns null schemas when the tool declares none', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const bare = { ...version, tags: {}, input_schema_ref: null, output_schema_ref: null, json_schema: {} };
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version: bare }])
        ).unwrap();
        expect(fn).toBeDefined();

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(200);
        expect(response.json).toStrictEqual({
            uuid: fn!.config.uuid,
            integration_id: 'github-123',
            provider: 'github',
            name: 'fetchIssue',
            description: 'Fetch an issue',
            input_json_schema: null,
            output_json_schema: null,
            source: 'repo',
            meta: { tags: {} }
        });
    });

    it('returns 404 if the tool or the integration does not exist', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');

        const noIntegration = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'unknown', name: 'fetchIssue' } });
        expect(noIntegration.res.status).toBe(404);
        isError(noIntegration.json);
        expect(noIntegration.json.error.code).toBe('not_found');

        const noTool = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'unknown' } });
        expect(noTool.res.status).toBe(404);
        isError(noTool.json);
        expect(noTool.json.error.code).toBe('not_found');
    });

    it('returns 404 if the tool is disabled', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();
        expect(fn).toBeDefined();
        await db.knex('function_configs').where({ id: fn!.config.id }).update({ enabled: false });

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('not_found');
    });

    it('returns 404 if the function is not http triggered', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: env.id,
                    integrationId: 'github-123',
                    name: 'fetchIssue',
                    version: { ...version, trigger: { kind: 'schedule', frequency: '0 * * * *' } }
                }
            ])
        ).unwrap();
        expect(fn).toBeDefined();

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('not_found');
    });

    it('returns 404 if the tool belongs to another environment', async () => {
        const { env: otherEnv } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(otherEnv, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: otherEnv.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();
        expect(fn).toBeDefined();

        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github-123', name: 'fetchIssue' } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('not_found');
    });
});

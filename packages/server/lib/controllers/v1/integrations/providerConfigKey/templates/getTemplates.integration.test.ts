import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../../utils/tests.js';

const route = '/api/v1/integrations/:providerConfigKey/templates';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' }, params: { providerConfigKey: 'github' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(
            route,
            // @ts-expect-error missing query on purpose
            { method: 'GET', token: apiKey.secret, params: { providerConfigKey: 'github' } }
        );

        shouldRequireQueryEnv(res);
    });

    it('should return 404 when integration does not exist', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'unknown-integration' },
            token: apiKey.secret
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json).toStrictEqual<typeof res.json>({
            error: { code: 'not_found', message: 'Integration does not exist' }
        });
    });

    it('should return templates without deployed metadata when nothing is deployed', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.length).toBeGreaterThan(0);
        for (const tpl of res.json.data) {
            expect(tpl).not.toHaveProperty('deployed');
        }
    });

    it('omits action templates replaced by disabled native tools', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });
        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const action = res.json.data.find((fn) => fn.type === 'action');
        expect(action).toBeDefined();
        const [tool] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: env.id,
                    integrationId: 'github',
                    name: action!.name,
                    version: {
                        description: 'Native tool',
                        tags: {},
                        file_location: 'github/functions/native.js',
                        version: 'test',
                        source: 'repo',
                        trigger: { kind: 'http' },
                        requires: { connection: true, outbound: false, invoke: false },
                        capabilities: { usesRecords: false, usesOutbound: false, usesCheckpoints: false, usesMetadata: false, usesInvoke: false },
                        limits: { concurrency: { perConnection: 'max' } },
                        input_schema_ref: null,
                        output_schema_ref: null,
                        model_schema_refs: [],
                        metadata_schema_ref: null,
                        checkpoint_schema_ref: null,
                        json_schema: {}
                    }
                }
            ])
        ).unwrap();
        await db.knex('function_configs').where({ id: tool!.config.id }).update({ enabled: false });
        const updated = await api.fetch(route, { method: 'GET', token: apiKey.secret, query: { env: 'dev' }, params: { providerConfigKey: 'github' } });
        expect(updated.res.status).toBe(200);
        isSuccess(updated.json);
        expect(updated.json.data.some((fn) => fn.type === 'action' && fn.name === action!.name)).toBe(false);
        expect(updated.json.data).toHaveLength(res.json.data.length - 1);
    });

    it('should attach deployed metadata when a function with the same name+type exists', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'issues',
            type: 'sync'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);

        const issues = res.json.data.find((tpl) => tpl.name === 'issues' && tpl.type === 'sync');
        expect(issues).toBeDefined();
        expect(issues?.deployed).toMatchObject({
            id: expect.any(Number),
            enabled: expect.any(Boolean),
            last_deployed: expect.any(String),
            source: expect.any(String)
        });

        const otherTemplates = res.json.data.filter((tpl) => !(tpl.name === 'issues' && tpl.type === 'sync'));
        for (const tpl of otherTemplates) {
            expect(tpl).not.toHaveProperty('deployed');
        }
    });

    it('should not match a deployed function across types or providers', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        // Same template name, but as an action — should not match the `issues` sync template.
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'issues',
            type: 'action'
        });

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'github' },
            token: apiKey.secret
        });

        isSuccess(res.json);
        const issuesSync = res.json.data.find((tpl) => tpl.name === 'issues' && tpl.type === 'sync');
        expect(issuesSync).toBeDefined();
        expect(issuesSync).not.toHaveProperty('deployed');
    });

    it('should return empty data when the integration has no template entries', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        // Use a unique_key for a provider that has no templates in flows.zero.json.
        await seeders.createConfigSeed(env, 'custom', 'unauthenticated');

        const res = await api.fetch(route, {
            method: 'GET',
            query: { env: 'dev' },
            params: { providerConfigKey: 'custom' },
            token: apiKey.secret
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data).toStrictEqual([]);
    });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { FunctionListType } from '@nangohq/types';

const route = '/integrations/:uniqueKey/functions/:name';
let api: Awaited<ReturnType<typeof runServer>>;

async function seedWithScopes(scopes: string[]) {
    const seed = await seeders.seedAccountEnvAndUser();
    await db.knex('customer_keys').where('id', seed.apiKey.id).update({ scopes });
    return seed;
}

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, { method: 'GET', params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        shouldBeProtected(res);
    });

    it('should reject a key lacking the read scope', async () => {
        const seed = await seedWithScopes(['environment:functions:list']);

        const res = await api.fetch(route, { method: 'GET', token: seed.apiKey.secret, params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(403);
        expect(res.json.error.code).toBe('forbidden');
    });

    it('should 404 when the function does not exist', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github', name: 'does-not-exist' }, query: {} });

        isError(res.json);
        expect(res.res.status).toBe(404);
        expect(res.json.error.code).toBe('not_found');
    });

    it('should return a function for the environment derived from the key', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });

        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id!,
            sync_name: 'my-sync',
            type: 'sync'
        });

        const res = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github', name: 'my-sync' }, query: {} });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json.data.name).toBe('my-sync');
        expect(res.json.data.type).toBe('sync');
    });

    it.each(['public', 'private'] as const)('disambiguates tools from same-named syncs on the %s endpoint', async (surface) => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        const integration = await seeders.createConfigSeed(env, 'github', 'github');
        const connection = await seeders.createConnectionSeed({ env, provider: 'github' });
        if (integration.id === undefined) {
            throw new Error('Expected seeded integration');
        }
        await seeders.createSyncSeeds({
            connectionId: connection.id,
            environment_id: env.id,
            nango_config_id: integration.id,
            sync_name: 'shared-name',
            type: 'sync'
        });
        const [tool] = (
            await functionConfigService.upsert(db.knex, [
                {
                    environmentId: env.id,
                    integrationId: 'github',
                    name: 'shared-name',
                    version: {
                        description: 'Read users',
                        tags: { instructions: 'Read users', required_scopes: ['read'], category: 'crm' },
                        file_location: 'functions/shared-name',
                        version: 'test',
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
                        json_schema: { definitions: { Input: { type: 'string' } } }
                    }
                }
            ])
        ).unwrap();
        if (!tool) {
            throw new Error('Expected seeded tool function');
        }
        const fetchFunction = (type?: FunctionListType) =>
            surface === 'public'
                ? api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uniqueKey: 'github', name: 'shared-name' }, query: type ? { type } : {} })
                : api.fetch('/api/v1/integrations/:providerConfigKey/functions/:functionName', {
                      method: 'GET',
                      token: apiKey.secret,
                      params: { providerConfigKey: 'github', functionName: 'shared-name' },
                      query: { env: env.name, ...(type ? { type } : {}) }
                  });

        const untyped = await fetchFunction();
        expect(untyped.res.status).toBe(200);
        isSuccess(untyped.json);
        expect(untyped.json.data.type).toBe('sync');

        const sync = await fetchFunction('sync');
        expect(sync.res.status).toBe(200);
        isSuccess(sync.json);
        expect(sync.json.data.type).toBe('sync');

        const typed = await fetchFunction('tool');
        expect(typed.res.status).toBe(200);
        isSuccess(typed.json);
        expect(typed.json.data).toMatchObject({
            name: 'shared-name',
            type: 'tool',
            uuid: tool.config.uuid,
            input_json_schema: { $ref: '#/definitions/Input', definitions: { Input: { type: 'string' } } },
            output_json_schema: null,
            meta: { instructions: 'Read users', required_scopes: ['read'], tags: { category: 'crm' } }
        });

        const unmatched = await fetchFunction('on-event');
        expect(unmatched.res.status).toBe(404);
        isError(unmatched.json);
        expect(unmatched.json.error.code).toBe('not_found');
    });
});

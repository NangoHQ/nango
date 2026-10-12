import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { functionConfigService, seeders } from '@nangohq/shared';

import { isError, runServer, shouldBeProtected } from '../../utils/tests.js';

import type { DBFunctionConfigVersion } from '@nangohq/types';

const route = '/functions/:uuid';
let api: Awaited<ReturnType<typeof runServer>>;

const version = {
    description: 'Fetch an issue',
    file_location: 'github/functions/fetchIssue.js',
    version: 'test-version',
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
} satisfies Omit<DBFunctionConfigVersion, 'id' | 'function_config_id' | 'created_at' | 'updated_at' | 'deleted_at'>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('requires authentication and the read scope', async () => {
        shouldBeProtected(await api.fetch(route, { method: 'GET', params: { uuid: randomUUID() } }));

        const { apiKey } = await seeders.seedAccountEnvAndUser();
        await db
            .knex('customer_keys')
            .where({ id: apiKey.id })
            .update({ scopes: ['environment:functions:list'] });
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: randomUUID() } });
        expect(response.res.status).toBe(403);
    });

    it('validates the UUID and rejects query parameters', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const invalid = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: '123' } });
        expect(invalid.res.status).toBe(400);
        isError(invalid.json);
        expect(invalid.json.error.code).toBe('invalid_uri_params');

        const query = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: randomUUID() }, query: { extra: 'x' } as never });
        expect(query.res.status).toBe(400);
        isError(query.json);
        expect(query.json.error.code).toBe('invalid_query_params');
    });

    it('returns a function by UUID', async () => {
        const { apiKey, env } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: env.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();
        expect(fn).toBeDefined();

        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: fn!.config.uuid } });
        expect(response.res.status).toBe(200);
        expect(response.json).toMatchObject({
            uuid: fn!.config.uuid,
            integration_id: 'github-123',
            provider: 'github',
            name: 'fetchIssue',
            description: 'Fetch an issue',
            state: 'enabled',
            source: 'repo',
            trigger: { kind: 'http' },
            created_at: fn!.config.created_at.toISOString(),
            updated_at: fn!.config.updated_at.toISOString()
        });
    });

    it('returns 404 if the function does not exist', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: randomUUID() } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('not_found');
    });

    it('returns 404 if the function belongs to another environment', async () => {
        const { env: otherEnv } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(otherEnv, 'github-123', 'github');
        const [fn] = (
            await functionConfigService.upsert(db.knex, [{ environmentId: otherEnv.id, integrationId: 'github-123', name: 'fetchIssue', version }])
        ).unwrap();
        expect(fn).toBeDefined();

        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const response = await api.fetch(route, { method: 'GET', token: apiKey.secret, params: { uuid: fn!.config.uuid } });
        expect(response.res.status).toBe(404);
        isError(response.json);
        expect(response.json.error.code).toBe('not_found');
    });
});

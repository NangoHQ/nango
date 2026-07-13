import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { isError, isSuccess, runServer, shouldBeProtected } from '../../../../utils/tests.js';

import type { DBConnection } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

const endpoint = '/connections/:connectionId/config';

describe(`PATCH ${endpoint}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' },
            body: { connection_config: {} }
        });

        shouldBeProtected(res);
    });

    it('should replace connection config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'github' },
            body: { connection_config: { tenant_id: 'abc' } }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.connection_config).toStrictEqual({ tenant_id: 'abc' });
    });

    it('should return 404 for unknown connection', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: 'unknown' },
            query: { provider_config_key: 'github' },
            body: { connection_config: {} }
        });

        isError(res.json);
        expect(res.res.status).toBe(404);
    });

    it('should reject body without connection_config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'github' },
            // @ts-expect-error — intentionally omit required body field
            body: {}
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_body' } });
    });

    it('should reject webhook_url pointing to nango.dev', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'github' },
            body: { connection_config: { webhook_url: 'https://api.nango.dev/hook' } }
        });

        isError(res.json);
        expect(res.res.status).toBe(400);
        expect(res.json).toMatchObject({ error: { code: 'invalid_body' } });
    });

    it('should accept a valid webhook_url in connection_config', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(endpoint, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: conn.connection_id },
            query: { provider_config_key: 'github' },
            body: { connection_config: { webhook_url: 'https://example.com/webhooks-from-nango' } }
        });

        isSuccess(res.json);

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.connection_config).toMatchObject({ webhook_url: 'https://example.com/webhooks-from-nango' });
    });
});

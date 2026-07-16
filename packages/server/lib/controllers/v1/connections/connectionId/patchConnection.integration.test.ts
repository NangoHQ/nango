import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { DBConnection } from '@nangohq/types';

const route = '/api/v1/connections/:connectionId';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`PATCH ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'PATCH',
            params: { connectionId: 'test' },
            query: { env: 'dev', provider_config_key: 'github' },
            body: {}
        });

        shouldBeProtected(res);
    });

    it('should require query env', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' } as any,
            body: {}
        });

        shouldRequireQueryEnv(res);
    });

    it('should update tags', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'PATCH',
            query: { env: env.name, provider_config_key: 'github' },
            params: { connectionId: conn.connection_id },
            body: { tags: { projectId: '123' } },
            session
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.tags).toStrictEqual({ projectid: '123' });
    });

    it('should update webhook_url', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });

        const res = await api.fetch(route, {
            method: 'PATCH',
            token: apiKey.secret,
            params: { connectionId: conn.connection_id },
            query: { env: env.name, provider_config_key: 'github' },
            body: { webhook_url: 'https://example.com/webhooks-from-nango' }
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.connection_config).toMatchObject({ webhook_url: 'https://example.com/webhooks-from-nango' });
    });
});

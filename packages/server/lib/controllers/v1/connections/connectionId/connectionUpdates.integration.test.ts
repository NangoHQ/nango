import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer } from '../../../../utils/tests.js';

import type { DBConnection } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

describe('private connection updates', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should update tags via PATCH /api/v1/connections/:connectionId', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/connections/:connectionId', {
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

    it('should replace metadata via POST /api/v1/connections/:connectionId/metadata', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/connections/:connectionId/metadata', {
            method: 'POST',
            query: { env: env.name, provider_config_key: 'github' },
            params: { connectionId: conn.connection_id },
            body: { metadata: { region: 'us-east' } },
            session
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.metadata).toStrictEqual({ region: 'us-east' });
    });

    it('should replace connection config via PATCH /api/v1/connections/:connectionId/config', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/connections/:connectionId/config', {
            method: 'PATCH',
            query: { env: env.name, provider_config_key: 'github' },
            params: { connectionId: conn.connection_id },
            body: { connection_config: { subdomain: 'acme' } },
            session
        });

        isSuccess(res.json);
        expect(res.json).toStrictEqual({ success: true });

        const updatedConn = await db.knex.select('*').from<DBConnection>('_nango_connections').where({ id: conn.id }).first();
        expect(updatedConn?.connection_config).toStrictEqual({ subdomain: 'acme' });
    });
});

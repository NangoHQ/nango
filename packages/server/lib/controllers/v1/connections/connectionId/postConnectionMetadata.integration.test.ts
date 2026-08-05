import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../../utils/tests.js';

import type { DBConnection } from '@nangohq/types';

const route = '/api/v1/connections/:connectionId/metadata';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`POST ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        const res = await api.fetch(route, {
            method: 'POST',
            params: { connectionId: 'test' },
            query: { env: 'dev', provider_config_key: 'github' },
            body: { metadata: {} }
        });

        shouldBeProtected(res);
    });

    it('should require query env', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();
        const res = await api.fetch(route, {
            method: 'POST',
            token: apiKey.secret,
            params: { connectionId: 'test' },
            query: { provider_config_key: 'github' } as any,
            body: { metadata: {} }
        });

        shouldRequireQueryEnv(res);
    });

    it('should replace metadata', async () => {
        const { env, user } = await seeders.seedAccountEnvAndUser();
        await seeders.createConfigSeed(env, 'github', 'github');
        const conn = await seeders.createConnectionSeed({ env, provider: 'github' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
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
});

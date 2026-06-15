import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { envs as logsEnvs } from '@nangohq/logs';
import { seeders } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { envs } from '../env.js';
import { authenticateUser, runServer } from '../utils/tests.js';

let api: Awaited<ReturnType<typeof runServer>>;

const ADMIN_UUID = 'e1e8fee9-a459-46fe-9e82-15c93dae2406';

describe('Slack admin connection helpers — connection id binding', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    beforeEach(() => {
        flags.hasAdminCapabilities = true;
        // getAdminAuthInfo reads envs from ../env.js, deleteAdminConnection from @nangohq/logs
        envs.NANGO_ADMIN_UUID = ADMIN_UUID;
        logsEnvs.NANGO_ADMIN_UUID = ADMIN_UUID;
    });
    afterEach(() => {
        flags.hasAdminCapabilities = false;
    });

    describe('GET /api/v1/environment/admin-auth', () => {
        it('should reject a connection_id that does not match the caller account/environment', async () => {
            const { account, env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // @ts-expect-error route not in endpoint types
            const res = await api.fetch('/api/v1/environment/admin-auth', {
                method: 'GET',
                query: { env: env.name, connection_id: `account-${account.uuid}-999999` },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should not reject the connection_id derived from the caller account/environment', async () => {
            const { account, env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // @ts-expect-error route not in endpoint types
            const res = await api.fetch('/api/v1/environment/admin-auth', {
                method: 'GET',
                query: { env: env.name, connection_id: `account-${account.uuid}-${env.id}` },
                session
            });

            expect(res.res.status).not.toBe(403);
        });
    });

    describe('DELETE /api/v1/connections/admin/:connectionId', () => {
        it('should reject a connectionId that does not match the caller account/environment', async () => {
            const { account, env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // @ts-expect-error route not in endpoint types
            const res = await api.fetch('/api/v1/connections/admin/:connectionId', {
                method: 'DELETE',
                query: { env: env.name },
                params: { connectionId: `account-${account.uuid}-999999` },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should not reject the connectionId derived from the caller account/environment', async () => {
            const { account, env, user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            // @ts-expect-error route not in endpoint types
            const res = await api.fetch('/api/v1/connections/admin/:connectionId', {
                method: 'DELETE',
                query: { env: env.name },
                params: { connectionId: `account-${account.uuid}-${env.id}` },
                session
            });

            expect(res.res.status).not.toBe(403);
        });
    });
});

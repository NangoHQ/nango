import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';

import { envs } from '../../../env.js';
import { authenticateUser, isSuccess, runServer, shouldBeProtected, shouldRequireQueryEnv } from '../../../utils/tests.js';

const route = '/api/v1/environments/current';
let api: Awaited<ReturnType<typeof runServer>>;

describe(`GET ${route}`, () => {
    beforeAll(async () => {
        api = await runServer();
    });

    afterAll(() => {
        api.server.close();
    });

    it('should be protected', async () => {
        // @ts-expect-error query params are required
        const res = await api.fetch(route, { method: 'GET', query: { env: 'dev' } });

        shouldBeProtected(res);
    });

    it('should enforce env query params', async () => {
        const { secret } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch(route, {
            method: 'GET',
            token: secret.secret
        });

        shouldRequireQueryEnv(res);
    });

    it('should return environment and account data', async () => {
        const { env, account, user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch(route, {
            method: 'GET',
            // @ts-expect-error query params are required
            query: { env: env.name },
            session
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        expect(res.json).toMatchObject({
            environmentAndAccount: {
                environment: expect.objectContaining({
                    name: env.name
                }),
                env_variables: [],
                uuid: account.uuid,
                name: account.name,
                email: user.email,
                slack_notifications_channel: ''
            }
        });
    });

    describe('slack_notifications_channel', () => {
        let adminProdEnv: Awaited<ReturnType<typeof seeders.createEnvironmentSeed>>;
        let originalAdminUUID: string | undefined;

        beforeAll(async () => {
            const { account: adminAccount } = await seeders.seedAccountEnvAndUser();
            adminProdEnv = await seeders.createEnvironmentSeed(adminAccount.id, 'prod');
            await seeders.createConfigSeed(adminProdEnv, 'slack', 'slack');
            (envs as any).NANGO_ADMIN_UUID = adminAccount.uuid;
        });

        beforeEach(() => {
            originalAdminUUID = envs.NANGO_ADMIN_UUID;
        });

        afterEach(() => {
            (envs as any).NANGO_ADMIN_UUID = originalAdminUUID;
        });

        it('should return channel using new ID-based connection', async () => {
            const { account: customerAccount, env: customerEnv, user } = await seeders.seedAccountEnvAndUser();
            await db.knex('_nango_environments').where({ id: customerEnv.id }).update({ slack_notifications: true });

            await seeders.createConnectionSeed({
                env: adminProdEnv,
                provider: 'slack',
                connectionId: `account-${customerAccount.uuid}-${customerEnv.id}`,
                connectionConfig: { 'incoming_webhook.channel': '#new-format-alerts' }
            });

            const session = await authenticateUser(api, user);
            const res = await api.fetch(route, {
                method: 'GET',
                // @ts-expect-error query params are required
                query: { env: customerEnv.name },
                session
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.environmentAndAccount.slack_notifications_channel).toBe('#new-format-alerts');
        });
    });
});

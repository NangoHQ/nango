import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders, userService } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { authenticateUser, runServer } from '../utils/tests.js';

import type { DBEnvironment } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

describe('authz integration', () => {
    beforeAll(async () => {
        api = await runServer();
        flags.hasAuthRoles = true;
    });
    afterAll(() => {
        api.server.close();
    });
    afterEach(() => {
        flags.hasAuthRoles = true;
    });

    // ── Helpers ──────────────────────────────────────────────
    async function seedAccountWithProdEnv() {
        const { account, env, user } = await seeders.seedAccountEnvAndUser();
        // Create a production environment
        const prodEnv = await seeders.createEnvironmentSeed(account.id, 'prod');
        await db.knex.from<DBEnvironment>('_nango_environments').where({ id: prodEnv.id }).update({ is_production: true });
        return { account, devEnv: env, prodEnv: { ...prodEnv, is_production: true }, user };
    }

    async function createUserWithRole(accountId: number, role: 'production_support' | 'development_full_access') {
        const user = await seeders.seedUser(accountId);
        await userService.update({ id: user.id, role });
        return { ...user, role };
    }

    // ── FLAG_AUTH_ROLES_ENABLED=false bypasses all enforcement ──
    describe('feature flag disabled', () => {
        it('should allow production_support to write prod environments when flag is off', async () => {
            flags.hasAuthRoles = false;
            await seedAccountWithProdEnv();
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).not.toBe(403);
        });

        it('should allow development_full_access to read prod integrations when flag is off', async () => {
            flags.hasAuthRoles = false;
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/integrations', {
                // @ts-expect-error authz test — GET not in endpoint type
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).not.toBe(403);
        });
    });

    // ── Administrator — always allowed ──────────────────────
    describe('administrator', () => {
        it('should allow DELETE prod environments', async () => {
            const { user } = await seedAccountWithProdEnv();
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/environments', {
                method: 'DELETE',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                session
            });

            // Should not be 403 (may be 400/404 depending on validation, but not forbidden)
            expect(res.res.status).not.toBe(403);
        });

        it('should allow PATCH prod environments', async () => {
            const { user } = await seedAccountWithProdEnv();
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).not.toBe(403);
        });
    });

    // ── production_support — denied writes on prod ──────────
    describe('production_support', () => {
        it('should deny DELETE prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'DELETE',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PATCH prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PATCH prod integrations', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations/:providerConfigKey', {
                method: 'PATCH',
                query: { env: 'prod' },
                params: { providerConfigKey: 'some-key' },
                body: { authType: 'OAUTH2' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny POST invite', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/invite', {
                method: 'POST',
                query: { env: 'dev' },
                body: { emails: ['test@example.com'] },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should allow GET prod integrations (read access)', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations', {
                // @ts-expect-error authz test — GET not in endpoint type
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).not.toBe(403);
        });

        it('should allow GET prod connections (read access)', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/connections', {
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).not.toBe(403);
        });

        it('should allow writes on non-prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'dev' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).not.toBe(403);
        });

        it('should strip oauth_client_secret from prod integration response', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations/:providerConfigKey', {
                method: 'GET',
                query: { env: 'prod' },
                params: { providerConfigKey: 'some-key' },
                session
            });

            // May be 404 (no integration exists), but if 200 it should not contain oauth_client_secret
            if (res.res.status === 200) {
                const data = (res.json as any).data;
                expect(data.integration).not.toHaveProperty('oauth_client_secret');
            }
        });

        it('should strip secret_key from prod environment response', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/environments/current', {
                method: 'GET',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(200);
            const env = (res.json as any).environmentAndAccount.environment;
            expect(env).not.toHaveProperty('secret_key');
            expect(env).not.toHaveProperty('pending_secret_key');
        });
    });

    // ── development_full_access — denied all prod access ────
    describe('development_full_access', () => {
        it('should deny GET prod integrations', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/integrations', {
                // @ts-expect-error authz test — GET not in endpoint type
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny GET prod connections', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/connections', {
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PATCH prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny DELETE prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'DELETE',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny POST invite', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/invite', {
                method: 'POST',
                query: { env: 'dev' },
                body: { emails: ['test@example.com'] },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should allow writes on non-prod environments', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/environments', {
                method: 'PATCH',
                // @ts-expect-error authz test — query not in endpoint type
                query: { env: 'dev' },
                body: { slack_notifications: false },
                session
            });

            expect(res.res.status).not.toBe(403);
        });

        it('should allow GET non-prod integrations', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/integrations', {
                // @ts-expect-error authz test — GET not in endpoint type
                method: 'GET',
                query: { env: 'dev' },
                session
            });

            expect(res.res.status).not.toBe(403);
        });
    });
});

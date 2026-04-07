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

        it('should deny DELETE invite', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/invite', {
                method: 'DELETE',
                query: { env: 'dev' },
                body: { email: 'test@example.com' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PUT team', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/team', {
                method: 'PUT',
                query: { env: 'dev' },
                body: { name: 'New Name' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny DELETE team/users/:id', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'DELETE',
                query: { env: 'dev' },
                params: { id: 9999 },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PATCH team/users/:id', async () => {
            const { account } = await seedAccountWithProdEnv();
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'PATCH',
                query: { env: 'dev' },
                params: { id: 9999 },
                body: { role: 'production_support' },
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
            const { account, prodEnv } = await seedAccountWithProdEnv();
            await seeders.createConfigSeed(prodEnv, 'github-prod', 'github', {
                oauth_client_id: 'test-id',
                oauth_client_secret: 'test-secret',
                oauth_scopes: 'repo'
            });
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations/:providerConfigKey', {
                method: 'GET',
                query: { env: 'prod' },
                params: { providerConfigKey: 'github-prod' },
                session
            });

            expect(res.res.status).toBe(200);
            const integration = (res.json as any).data.integration;
            expect(integration.oauth_client_id).toBe('');
            expect(integration.oauth_client_secret).toBe('');
        });

        it('should strip oauth_client_secret from prod integrations list response', async () => {
            const { account, prodEnv } = await seedAccountWithProdEnv();
            await seeders.createConfigSeed(prodEnv, 'github-list', 'github', {
                oauth_client_id: 'test-id',
                oauth_client_secret: 'test-secret',
                oauth_scopes: 'repo'
            });
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations', {
                // @ts-expect-error authz test — GET not in endpoint type
                method: 'GET',
                query: { env: 'prod' },
                session
            });

            expect(res.res.status).toBe(200);
            const integrations = (res.json as any).data;
            expect(integrations.length).toBeGreaterThan(0);
            for (const integration of integrations) {
                expect(integration.oauth_client_id).toBe('');
                expect(integration.oauth_client_secret).toBe('');
            }
        });

        it('should strip credentials from prod connection response', async () => {
            const { account, prodEnv } = await seedAccountWithProdEnv();
            await seeders.createConfigSeed(prodEnv, 'github-conn', 'github');
            await seeders.createConnectionSeed({
                env: prodEnv,
                provider: 'github-conn',
                connectionId: 'conn-prod-1',
                rawCredentials: { type: 'API_KEY', apiKey: 'super-secret-key' }
            });
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/connections/:connectionId', {
                method: 'GET',
                query: { env: 'prod', provider_config_key: 'github-conn' },
                params: { connectionId: 'conn-prod-1' },
                session
            });

            expect(res.res.status).toBe(200);
            const connection = (res.json as any).data.connection;
            expect(connection.credentials).toEqual({ type: 'API_KEY', apiKey: 'REDACTED' });
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

        it('should NOT strip credentials from non-prod integration response', async () => {
            const { account, devEnv } = await seedAccountWithProdEnv();
            await seeders.createConfigSeed(devEnv, 'github-dev', 'github', {
                oauth_client_id: 'dev-id',
                oauth_client_secret: 'dev-secret',
                oauth_scopes: 'repo'
            });
            const supportUser = await createUserWithRole(account.id, 'production_support');
            const session = await authenticateUser(api, supportUser);

            const res = await api.fetch('/api/v1/integrations/:providerConfigKey', {
                method: 'GET',
                query: { env: 'dev' },
                params: { providerConfigKey: 'github-dev' },
                session
            });

            expect(res.res.status).toBe(200);
            const integration = (res.json as any).data.integration;
            expect(integration.oauth_client_id).toBe('dev-id');
            expect(integration.oauth_client_secret).toBe('dev-secret');
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

        it('should deny GET prod syncs', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            // @ts-expect-error authz test — /sync not in endpoint types
            const res = await api.fetch('/api/v1/sync', {
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

        it('should deny DELETE invite', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/invite', {
                method: 'DELETE',
                query: { env: 'dev' },
                body: { email: 'test@example.com' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PUT team', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/team', {
                method: 'PUT',
                query: { env: 'dev' },
                body: { name: 'New Name' },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny DELETE team/users/:id', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'DELETE',
                query: { env: 'dev' },
                params: { id: 9999 },
                session
            });

            expect(res.res.status).toBe(403);
        });

        it('should deny PATCH team/users/:id', async () => {
            const { account } = await seedAccountWithProdEnv();
            const devUser = await createUserWithRole(account.id, 'development_full_access');
            const session = await authenticateUser(api, devUser);

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'PATCH',
                query: { env: 'dev' },
                params: { id: 9999 },
                body: { role: 'production_support' },
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

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import db from '@nangohq/database';
import { seeders } from '@nangohq/shared';
import { flags } from '@nangohq/utils';

import { envs } from '../env.js';
import { authenticateUser, runServer } from '../utils/tests.js';

import type { DBEnvironment } from '@nangohq/types';

let api: Awaited<ReturnType<typeof runServer>>;

describe('impersonation role override', () => {
    beforeAll(async () => {
        api = await runServer();
    });
    afterAll(() => {
        api.server.close();
    });
    beforeEach(() => {
        flags.hasAuthRoles = true;
        flags.hasAdminCapabilities = true;
    });
    afterEach(() => {
        flags.hasAuthRoles = true;
        flags.hasAdminCapabilities = false;
        (envs as any).NANGO_ADMIN_UUID = undefined;
        (envs as any).NANGO_IMPERSONATION_ROLE = undefined;
    });

    // Account with a production env and a default (administrator) user.
    async function seedTargetWithProdEnv({ hasRbac = true }: { hasRbac?: boolean } = {}) {
        const { account } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: hasRbac } });
        const prodEnv = await seeders.createEnvironmentSeed(account.id, 'prod');
        await db.knex.from<DBEnvironment>('_nango_environments').where({ id: prodEnv.id }).update({ is_production: true });
        return { account };
    }

    // Logs in as a fresh admin, impersonates the target account, and returns the impersonated session cookie.
    async function impersonate(targetAccountUUID: string): Promise<string> {
        const admin = await seeders.seedAccountEnvAndUser();
        (envs as any).NANGO_ADMIN_UUID = admin.account.uuid;

        const adminSession = await authenticateUser(api, admin.user);
        const res = await api.fetch('/api/v1/admin/impersonate', {
            method: 'POST',
            query: { env: 'dev' },
            session: adminSession,
            body: { accountUUID: targetAccountUUID, loginReason: 'regression test' }
        });
        expect(res.res.status).toBe(200);

        // req.login does not regenerate the session id, so the admin cookie now resolves to the
        // impersonated (debugMode) session; prefer a refreshed cookie if one was emitted.
        const setCookie = res.res.headers.getSetCookie();
        return setCookie[0]?.split(';')[0] ?? adminSession;
    }

    it('keeps the impersonated administrator full access when no override is configured', async () => {
        const { account } = await seedTargetWithProdEnv();
        (envs as any).NANGO_IMPERSONATION_ROLE = undefined;
        const session = await impersonate(account.uuid);

        const res = await api.fetch('/api/v1/environments', {
            method: 'PATCH',
            // @ts-expect-error query not in endpoint type
            query: { env: 'prod' },
            body: { slack_notifications: false },
            session
        });

        expect(res.res.status).not.toBe(403);
    });

    it('downgrades the impersonated session to the override role, denying prod writes', async () => {
        const { account } = await seedTargetWithProdEnv();
        (envs as any).NANGO_IMPERSONATION_ROLE = 'production_support';
        const session = await impersonate(account.uuid);

        const res = await api.fetch('/api/v1/environments', {
            method: 'PATCH',
            // @ts-expect-error query not in endpoint type
            query: { env: 'prod' },
            body: { slack_notifications: false },
            session
        });

        expect(res.res.status).toBe(403);
    });

    it('enforces the override role even when the impersonated plan has RBAC disabled', async () => {
        const { account } = await seedTargetWithProdEnv({ hasRbac: false });
        (envs as any).NANGO_IMPERSONATION_ROLE = 'production_support';
        const session = await impersonate(account.uuid);

        const res = await api.fetch('/api/v1/environments', {
            method: 'PATCH',
            // @ts-expect-error query not in endpoint type
            query: { env: 'prod' },
            body: { slack_notifications: false },
            session
        });

        expect(res.res.status).toBe(403);
    });

    it('still allows prod reads under the override role', async () => {
        const { account } = await seedTargetWithProdEnv();
        (envs as any).NANGO_IMPERSONATION_ROLE = 'production_support';
        const session = await impersonate(account.uuid);

        const res = await api.fetch('/api/v1/integrations', {
            // @ts-expect-error GET not in endpoint type
            method: 'GET',
            query: { env: 'prod' },
            session
        });

        expect(res.res.status).not.toBe(403);
    });
});

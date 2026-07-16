import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { audit } from '@nangohq/audit';
import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders, updatePlan, userService } from '@nangohq/shared';

import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { MockInstance } from 'vitest';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// Sets up an account + env + a connection under provider_config_key 'algolia'.
async function seedConnection() {
    const seed = await seeders.seedAccountEnvAndUser();
    await seeders.createConfigSeed(seed.env, 'algolia', 'algolia');
    const connection = await seeders.createConnectionSeed({
        env: seed.env,
        provider: 'algolia',
        rawCredentials: { type: 'API_KEY', apiKey: 'test_api_key' }
    });
    return { ...seed, connection };
}

describe('audit middleware (private API)', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // getFlags() returns the stable noop facade in tests; force the audit trail on.
        vi.spyOn(featureFlags.getFlags(), 'isAuditTrailEnabled').mockResolvedValue(true);
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
    });

    it('audit log for a deleted connection', async () => {
        const { user, connection } = await seedConnection();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/connections/:connectionId', {
            method: 'DELETE',
            session,
            params: { connectionId: connection.connection_id },
            query: { provider_config_key: 'algolia', env: 'dev' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            outcome: 'success',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'connection', id: connection.connection_id }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('audit log for a member role change', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'production_support' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }],
            metadata: { toRole: 'production_support' }
        });
    });

    it('audit log (denied) for a member role change the caller may not perform', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        // Demote the acting user so `can(canUpdateTeamMember)` rejects with 403 before the controller runs.
        await userService.update({ id: user.id, role: 'production_support' });
        const targetUser = await seeders.seedUser(account.id);
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: targetUser.id },
            body: { role: 'development_full_access' }
        });

        expect(res.res.status).toBe(403);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            outcome: 'denied',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }]
        });
    });

    it('does not leak a cross-account member email into the target display', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const other = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        // Target a member that belongs to a DIFFERENT account. The controller rejects it, but the point
        // is that the audit event must not carry the other account's email in the target display.
        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: other.user.id },
            body: { role: 'administrator' }
        });

        expect(res.res.status).toBe(400);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            targets: [{ type: 'member', id: String(other.user.id) }]
        });
        expect(event?.targets[0]).not.toHaveProperty('display');
    });
});

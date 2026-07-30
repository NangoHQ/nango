import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { customerKeyService, seeders, updatePlan, userService } from '@nangohq/shared';

import { audit } from '../audit.js';
import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { AuditAction, AuditResource } from '@nangohq/audit';
import type { MockInstance } from 'vitest';

// The single audit integration suite: only the cases that genuinely need the live stack. Everything
// else — event shape, redaction, actor resolution, outcome mapping, the disabled-account gate,
// resolve-before-next mechanics — is covered off-stack in auditable.unit.test.ts.
//
// What has to stay here:
//   - wiring ORDER: a denied (403) request must still be recorded, which only holds if the audit
//     middleware is installed before authorization. Probed once per wiring shape (public withScope,
//     private can).
//   - resolve-before-next against a REAL controller that mutates the row it audits (a fake can't
//     honestly reproduce the mutation): pre-change role, removed-member email.
//   - a REAL authorization rejection that must not leak a cross-account email.

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// authenticateUser() signs in, and once sign-in is itself audited that records a leading app_auth/login
// event — so the event under test is not necessarily calls[0]. Select it by resource/action.
function auditEvent(resource: AuditResource, action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.resource === resource && event.action === action);
}

describe('audit middleware — live-stack contract', () => {
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

    describe('wiring order — denied requests are still recorded', () => {
        it('private (webAuth + can): a role change the caller may not perform', async () => {
            const { account, user, plan } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, has_rbac: true });
            // Demote the caller so can(canUpdateTeamMember) rejects with 403 before the controller runs.
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
                expect(auditEvent('member', 'role_changed')).toBeDefined();
            });
            expect(auditEvent('member', 'role_changed')).toMatchObject({
                resource: 'member',
                action: 'role_changed',
                outcome: 'denied',
                accountId: account.id,
                environment: null,
                actor: { type: 'user', id: String(user.id) }
            });
        });

        it('public (apiAuth + withScope): a scope the key does not hold', async () => {
            const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
            // Restrict the key so withScope('environment:connections:update') rejects with 403 first.
            (await customerKeyService.updateApiKeyScopes(db.knex, apiKey.id, ['environment:integrations:list'], env.id)).unwrap();

            const res = await api.fetch('/connections/:connectionId', {
                method: 'PATCH',
                token: apiKey.secret,
                params: { connectionId: 'whatever' },
                query: { provider_config_key: 'algolia' },
                body: {}
            });

            expect(res.res.status).toBe(403);
            await vi.waitFor(() => {
                expect(auditEvent('connection', 'updated')).toBeDefined();
            });
            expect(auditEvent('connection', 'updated')).toMatchObject({
                resource: 'connection',
                action: 'updated',
                outcome: 'denied',
                accountId: account.id,
                environment: { id: env.id, display: env.name },
                actor: { type: 'api_key', id: String(apiKey.id) }
            });
        });
    });

    describe('resolve-before-next against a real controller', () => {
        it('captures the pre-change role, resolved before the controller overwrites it', async () => {
            const { account, user, plan } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, has_rbac: true });
            const targetUser = await seeders.seedUser(account.id);
            await userService.update({ id: targetUser.id, role: 'development_full_access' });
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
                expect(auditEvent('member', 'role_changed')).toBeDefined();
            });
            expect(auditEvent('member', 'role_changed')).toMatchObject({
                resource: 'member',
                action: 'role_changed',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                metadata: { fromRole: 'development_full_access', toRole: 'production_support' }
            });
        });

        it('captures a removed member email, resolved before the controller moves the row', async () => {
            const { account, user, plan } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, has_rbac: true });
            const targetUser = await seeders.seedUser(account.id);
            const session = await authenticateUser(api, user);

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'DELETE',
                session,
                query: { env: 'dev' },
                params: { id: targetUser.id }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            await vi.waitFor(() => {
                expect(auditEvent('member', 'removed')).toBeDefined();
            });
            expect(auditEvent('member', 'removed')).toMatchObject({
                resource: 'member',
                action: 'removed',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }]
            });
        });
    });

    it('does not leak a cross-account member email on a real authorization rejection', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const other = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/team/users/:id', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            params: { id: other.user.id },
            body: { role: 'administrator' }
        });

        expect(res.res.status).toBe(400);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'role_changed')).toBeDefined();
        });
        const event = auditEvent('member', 'role_changed');
        expect(event).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            accountId: account.id,
            environment: null,
            targets: [{ type: 'member', id: String(other.user.id) }]
        });
        expect(event?.targets[0]).not.toHaveProperty('display');
    });
});

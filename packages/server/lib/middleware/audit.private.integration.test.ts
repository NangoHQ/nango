import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders, updatePlan, userService } from '@nangohq/shared';

import { audit } from '../audit.js';
import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { AuditAction, AuditResource } from '@nangohq/audit';
import type { MockInstance } from 'vitest';

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// authenticateUser() signs in, which now records an app_auth/login event, so the event under test is
// not necessarily calls[0]. Select it by resource/action instead of by position.
function auditEvent(resource: AuditResource, action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.resource === resource && event.action === action);
}

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
            expect(auditEvent('connection', 'deleted')).toBeDefined();
        });
        expect(auditEvent('connection', 'deleted')).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            outcome: 'success',
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'connection', id: connection.connection_id }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('audit log for a member role change captures the pre-change role', async () => {
        const { account, user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        const targetUser = await seeders.seedUser(account.id);
        // Pin a known starting role; the controller overwrites it, so fromRole proves we resolved before it ran.
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
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }],
            metadata: { fromRole: 'development_full_access', toRole: 'production_support' }
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
            expect(auditEvent('member', 'role_changed')).toBeDefined();
        });
        expect(auditEvent('member', 'role_changed')).toMatchObject({
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
            expect(auditEvent('member', 'role_changed')).toBeDefined();
        });
        const event = auditEvent('member', 'role_changed');
        expect(event).toMatchObject({
            resource: 'member',
            action: 'role_changed',
            targets: [{ type: 'member', id: String(other.user.id) }]
        });
        expect(event?.targets[0]).not.toHaveProperty('display');
    });

    it('records the changed field names (not values) for a connection update', async () => {
        const { user, connection } = await seedConnection();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/connections/:connectionId', {
            method: 'PATCH',
            session,
            params: { connectionId: connection.connection_id },
            query: { provider_config_key: 'algolia', env: 'dev' },
            body: { webhook_url_override: 'https://leaked-value.test/hook' }
        });

        expect(res.res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditEvent('connection', 'updated')).toBeDefined();
        });
        const event = auditEvent('connection', 'updated');
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'updated',
            outcome: 'success',
            metadata: { providerConfigKey: 'algolia', changedFields: ['webhook_url_override'] }
        });
        // Only the field name is recorded — the submitted value must not reach the audit record.
        expect(JSON.stringify(event)).not.toContain('leaked-value');
    });

    it('records variable names but never their values', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/environments/variables', {
            method: 'POST',
            session,
            query: { env: 'dev' },
            body: {
                variables: [
                    { name: 'API_URL', value: 'https://secret.example' },
                    { name: 'TOKEN', value: 'super-secret-value' }
                ]
            }
        });

        expect(res.res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditEvent('environment', 'variables_changed')).toBeDefined();
        });
        const event = auditEvent('environment', 'variables_changed');
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'variables_changed',
            metadata: { variableCount: 2, variableNames: ['API_URL', 'TOKEN'] }
        });
        // The values must never reach the audit record.
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-value');
        expect(serialized).not.toContain('secret.example');
    });

    it('records the new webhook URLs for a webhook settings change', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/environments/webhook', {
            method: 'PATCH',
            session,
            query: { env: 'dev' },
            body: { primary_url: 'https://hooks.example/primary?token=shh-secret' }
        });

        expect(res.res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditEvent('environment', 'webhook_urls_changed')).toBeDefined();
        });
        const event = auditEvent('environment', 'webhook_urls_changed');
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            // Only the origin is recorded — path and any secret query params are stripped.
            metadata: { primaryUrl: 'https://hooks.example' }
        });
        expect(JSON.stringify(event)).not.toContain('shh-secret');
    });

    it('captures a removed member email resolved before the controller moves the row', async () => {
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
        // The controller moves the member out of the account, so the email is only knowable if the
        // target was resolved before the handler ran — this guards the resolve-before-next() timing.
        expect(auditEvent('member', 'removed')).toMatchObject({
            resource: 'member',
            action: 'removed',
            outcome: 'success',
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }]
        });
    });
});

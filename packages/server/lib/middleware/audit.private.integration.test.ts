import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { seeders, updatePlan, userService } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { audit } from '../audit.js';
import { envs } from '../env.js';
import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { MockInstance } from 'vitest';

// Stripe is never called for real in tests — stub getStripe so the payment-method controllers can reach
// a 200 without hitting the network. detach deliberately returns card details to prove they never leak.
const mockSetupIntentsCreate = vi.fn();
const mockPaymentMethodsDetach = vi.fn();
vi.mock('@nangohq/billing', async () => {
    const actual = await vi.importActual('@nangohq/billing');
    return {
        ...actual,
        getStripe: vi.fn(() => ({
            setupIntents: { create: mockSetupIntentsCreate },
            paymentMethods: { detach: mockPaymentMethodsDetach }
        }))
    };
});

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
        // The stripe controllers gate on these envs being present before doing any work.
        (envs as any).STRIPE_SECRET_KEY = 'sk_test_audit';
        (envs as any).STRIPE_WEBHOOKS_SECRET = 'whsec_test_audit';
    });

    afterAll(() => {
        api.server.close();
        vi.restoreAllMocks();
    });

    beforeEach(() => {
        auditSpy.mockClear();
        mockSetupIntentsCreate.mockReset();
        mockPaymentMethodsDetach.mockReset();
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
            expect(auditSpy).toHaveBeenCalled();
        });
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
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
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
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
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
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
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
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
            expect(auditSpy).toHaveBeenCalled();
        });
        // The controller moves the member out of the account, so the email is only knowable if the
        // target was resolved before the handler ran — this guards the resolve-before-next() timing.
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'member',
            action: 'removed',
            outcome: 'success',
            targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }]
        });
    });

    // The stripe endpoints aren't registered in the typed APIEndpoints union, so `api.fetch` can't take
    // their paths — call them with raw fetch (session cookie + explicit `env` query param).
    const stripeUrl = (query: Record<string, string>) => `${api.url}/api/v1/stripe/payment_methods?${new URLSearchParams(query).toString()}`;

    it('audit log for a payment method added (collection initiated)', async () => {
        const { user, plan } = await seeders.seedAccountEnvAndUser();
        // Pre-set the Stripe customer so the controller skips customer creation and only mints a SetupIntent.
        await updatePlan(db.knex, { id: plan.id, stripe_customer_id: 'cus_test_audit' });
        mockSetupIntentsCreate.mockResolvedValue({ client_secret: 'seti_secret_should_never_be_logged' });
        const session = await authenticateUser(api, user);

        const res = await fetch(stripeUrl({ env: 'dev' }), { method: 'POST', headers: { Cookie: session } });

        expect(res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'billing',
            action: 'payment_method_added',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email }
        });
        // The SetupIntent client secret from the response must never reach the audit record.
        expect(JSON.stringify(event)).not.toContain('seti_secret');
    });

    it('audit log for a payment method removed records the opaque pm id and no card data', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        // Stripe returns card details on detach; none of it may reach the audit record.
        mockPaymentMethodsDetach.mockResolvedValue({ id: 'pm_abc123', card: { last4: '4242', brand: 'visa', number: '4242424242424242' } });
        const session = await authenticateUser(api, user);

        const res = await fetch(stripeUrl({ env: 'dev', payment_id: 'pm_abc123' }), { method: 'DELETE', headers: { Cookie: session } });

        expect(res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        const event = auditSpy.mock.calls[0]?.[0];
        expect(event).toMatchObject({
            resource: 'billing',
            action: 'payment_method_removed',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            metadata: { paymentMethodId: 'pm_abc123' }
        });
        // Only the opaque pm id is recorded — no card number, brand, or last4 from the Stripe response.
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('4242');
        expect(serialized).not.toContain('visa');
    });

    it('records a payment method removal with no pm id when the payment_id query param is omitted', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        mockPaymentMethodsDetach.mockResolvedValue({ id: 'pm_abc123' });
        const session = await authenticateUser(api, user);

        // The audit middleware runs before the controller's zod, so it reads `req.query.payment_id`
        // while it can still be undefined — resolving metadata must not throw. `logger.error` is inherited
        // from a prototype shared by every audit logger, so spying it here catches the middleware's own logger.
        const auditLogger = getLogger('Audit');
        let errorProto: object = auditLogger;
        while (errorProto && !Object.prototype.hasOwnProperty.call(errorProto, 'error')) {
            errorProto = Object.getPrototypeOf(errorProto) as object;
        }
        const errorSpy = vi.spyOn(errorProto as { error: (...args: unknown[]) => unknown }, 'error');

        try {
            await fetch(stripeUrl({ env: 'dev' }), { method: 'DELETE', headers: { Cookie: session } });

            await vi.waitFor(() => {
                expect(auditSpy).toHaveBeenCalled();
            });
            const event = auditSpy.mock.calls[0]?.[0];
            expect(event).toMatchObject({
                resource: 'billing',
                action: 'payment_method_removed'
            });
            // No pm id was supplied, so none may be recorded — and resolving it must not have thrown.
            expect(event).not.toHaveProperty('metadata.paymentMethodId');
            expect(errorSpy.mock.calls.some((call) => String(call[0]).includes('failed to resolve audit target'))).toBe(false);
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('audit log (denied) for a payment method removal the caller may not perform', async () => {
        const { user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        // Demote the acting user so `can(canManageBilling)` rejects with 403 before the controller runs.
        await userService.update({ id: user.id, role: 'production_support' });
        const session = await authenticateUser(api, user);

        const res = await fetch(stripeUrl({ env: 'dev', payment_id: 'pm_denied_789' }), { method: 'DELETE', headers: { Cookie: session } });

        expect(res.status).toBe(403);
        await vi.waitFor(() => {
            expect(auditSpy).toHaveBeenCalled();
        });
        // The pm id is resolved from the request before the authz gate runs, so a denial is still recorded.
        expect(auditSpy.mock.calls[0]?.[0]).toMatchObject({
            resource: 'billing',
            action: 'payment_method_removed',
            outcome: 'denied',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            metadata: { paymentMethodId: 'pm_denied_789' }
        });
        // Stripe must not have been touched for a denied request.
        expect(mockPaymentMethodsDetach).not.toHaveBeenCalled();
    });
});

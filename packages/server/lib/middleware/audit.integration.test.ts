import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { customerKeyService, seeders, updatePlan, userService } from '@nangohq/shared';
import { flags, getLogger } from '@nangohq/utils';

import { audit } from '../audit.js';
import { envs } from '../env.js';
import { authenticateUser, isSuccess, runServer } from '../utils/tests.js';

import type { AuditAction, AuditResource } from '@nangohq/audit';
import type { ApiKeyScope } from '@nangohq/types';
import type { MockInstance } from 'vitest';

// The single audit integration suite: only the cases that genuinely need the live stack. Everything
// else — event shape, redaction, actor resolution, outcome mapping, the disabled-account gate,
// resolve-before-next mechanics — is covered off-stack in audit/*.middleware.unit.test.ts.
//
// What has to stay here:
//   - wiring ORDER: a denied (403) request must still be recorded, which only holds if the audit
//     middleware is installed before authorization. Probed once per wiring shape (public withScope,
//     private can).
//   - resolve-before-next against a REAL controller that mutates the row it audits (a fake can't
//     honestly reproduce the mutation): pre-change role, removed-member email.
//   - a REAL authorization rejection that must not leak a cross-account email.
//
// connection.created is emitted from the connectionCreated hook rather than a middleware, so its
// live-stack cases live in auditConnection.integration.test.ts.

let api: Awaited<ReturnType<typeof runServer>>;
let auditSpy: MockInstance<typeof audit.record>;

// authenticateUser() signs in, which records an app_auth/login event, so the event under test is not
// necessarily calls[0]. Select it by resource/action instead of by position.
function auditEvent(resource: AuditResource, action: AuditAction) {
    return auditSpy.mock.calls.map((call) => call[0]).find((event) => event.resource === resource && event.action === action);
}

describe('audit middleware — live-stack contract', () => {
    beforeAll(async () => {
        api = await runServer();
        auditSpy = vi.spyOn(audit, 'record');
        // Roll the flag out to every account here; each one still has to be entitled on its plan.
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
            const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true, has_audit_trail_control_plane: true } });
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
            const { account, env, apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
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
                environment: { id: env.uuid, display: env.name },
                actor: { type: 'api_key', id: apiKey.uuid }
            });
        });

        it('records a denied public environment mutation against the account', async () => {
            const { account } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            const accountKey = (
                await customerKeyService.createAccountApiKey(db.knex, {
                    accountId: account.id,
                    displayName: 'Production only',
                    scopes: ['account:environments:set_production']
                })
            ).unwrap();

            const res = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'denied-environment' }
            });

            expect(res.res.status).toBe(403);
            await vi.waitFor(() => {
                expect(auditEvent('environment', 'created')).toBeDefined();
            });
            expect(auditEvent('environment', 'created')).toMatchObject({
                resource: 'environment',
                action: 'created',
                outcome: 'denied',
                accountId: account.id,
                environment: null,
                actor: { type: 'api_key', id: accountKey.uuid, display: 'Production only' },
                metadata: { name: 'denied-environment' }
            });
        });
    });

    describe('resolve-before-next against a real controller', () => {
        it('captures the pre-change role, resolved before the controller overwrites it', async () => {
            const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true, has_audit_trail_control_plane: true } });
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
            const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true, has_audit_trail_control_plane: true } });
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
            // Twin of the impersonation case below: an ordinary session must not be marked.
            expect(auditEvent('member', 'removed')).not.toHaveProperty('via');
        });
    });

    it('records nothing for an account that is not entitled to ingestion', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true } });
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
        // The emit is fire-and-forget on response finish, so give it a tick before asserting absence.
        await new Promise((resolve) => setImmediate(resolve));
        expect(auditSpy).not.toHaveBeenCalled();
    });

    it('does not leak a cross-account member email on a real authorization rejection', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
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

    // The id of a created resource is known only from the response body, so these specs resolve their
    // target with targetFromResponse — which only a real controller producing a real response can drive.
    describe('created-resource id from the real response', () => {
        it('records an integration creation with the created key and provider', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });

            const res = await api.fetch('/integrations', {
                method: 'POST',
                token: apiKey.secret,
                body: { provider: 'algolia', unique_key: 'audit-algolia' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            await vi.waitFor(() => {
                expect(auditEvent('integration', 'created')).toBeDefined();
            });
            expect(auditEvent('integration', 'created')).toMatchObject({
                resource: 'integration',
                action: 'created',
                outcome: 'success',
                targets: [{ type: 'integration', id: 'audit-algolia' }],
                metadata: { provider: 'algolia' }
            });
        });

        it('records an environment creation with the response id and is account-scoped', async () => {
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            await updatePlan(db.knex, { id: plan.id, environments_max: 10 });

            const res = await api.fetch('/api/v1/environments', {
                method: 'POST',
                token: apiKey.secret,
                body: { name: 'staging' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            expect(res.json.data.uuid).toBeUUID();
            const createdId = String(res.json.data.id);
            await vi.waitFor(() => {
                expect(auditEvent('environment', 'created')).toBeDefined();
            });
            expect(auditEvent('environment', 'created')).toMatchObject({
                resource: 'environment',
                action: 'created',
                outcome: 'success',
                // Account-scoped events null the environment field.
                environment: null,
                targets: [{ type: 'environment', id: createdId, display: 'staging' }],
                metadata: { name: 'staging' }
            });
        });

        it('records public environment creation and deletion with an Account API key', async () => {
            const { account, plan } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            await updatePlan(db.knex, { id: plan.id, environments_max: 10 });
            const accountKey = (
                await customerKeyService.createAccountApiKey(db.knex, {
                    accountId: account.id,
                    displayName: 'Environment automation',
                    scopes: ['account:*']
                })
            ).unwrap();

            const create = await api.fetch('/environments', {
                method: 'POST',
                token: accountKey.secret,
                body: { name: 'public-staging' }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            const createdId = create.json.data.uuid;
            await vi.waitFor(() => {
                expect(auditEvent('environment', 'created')).toBeDefined();
            });
            expect(auditEvent('environment', 'created')).toMatchObject({
                resource: 'environment',
                action: 'created',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                actor: { type: 'api_key', id: accountKey.uuid, display: 'Environment automation' },
                targets: [{ type: 'environment', id: createdId, display: 'public-staging' }],
                metadata: { name: 'public-staging' }
            });

            auditSpy.mockClear();
            const deletion = await api.fetch('/environments/:environmentUuid', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentUuid: create.json.data.uuid }
            });

            expect(deletion.res.status).toBe(204);
            await vi.waitFor(() => {
                expect(auditEvent('environment', 'deleted')).toBeDefined();
            });
            expect(auditEvent('environment', 'deleted')).toMatchObject({
                resource: 'environment',
                action: 'deleted',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                actor: { type: 'api_key', id: accountKey.uuid, display: 'Environment automation' },
                targets: [{ type: 'environment', id: createdId, display: 'public-staging' }]
            });
        });

        it.each<{ requested: ApiKeyScope[] | undefined; granted: ApiKeyScope[]; name: string }>([
            { requested: undefined, granted: ['environment:*'], name: 'ci-default' },
            { requested: ['environment:integrations:list'], granted: ['environment:integrations:list'], name: 'ci-scoped' }
        ])('records the scopes the dashboard granted an environment API key ($name)', async ({ requested, granted, name }) => {
            const { account, env, user } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            const session = await authenticateUser(api, user);
            auditSpy.mockClear();

            const create = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                session,
                // @ts-expect-error querystring is not typed on this endpoint
                query: { env: env.name },
                body: { display_name: name, ...(requested ? { scopes: requested } : {}) }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'created')).toBeDefined();
            });
            expect(auditEvent('api_key', 'created')).toMatchObject({
                resource: 'api_key',
                action: 'created',
                outcome: 'success',
                accountId: account.id,
                actor: { type: 'user', id: String(user.id), display: user.email },
                targets: [{ type: 'api_key', id: create.json.data.uuid, display: name }],
                metadata: { displayName: name, scopes: granted }
            });
            expect(JSON.stringify(auditEvent('api_key', 'created'))).not.toContain(create.json.data.secret);
        });

        it('records public environment API key creation and deletion with an Account API key', async () => {
            const { account, env } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            const accountKey = (
                await customerKeyService.createAccountApiKey(db.knex, {
                    accountId: account.id,
                    displayName: 'Key automation',
                    scopes: ['account:*']
                })
            ).unwrap();

            const create = await api.fetch('/environments/:environmentUuid/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid },
                body: { display_name: 'provisioned-ci' }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            const createdId = create.json.data.uuid;
            const secret = create.json.data.secret;
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'created')).toBeDefined();
            });
            expect(auditEvent('api_key', 'created')).toMatchObject({
                resource: 'api_key',
                action: 'created',
                outcome: 'success',
                accountId: account.id,
                environment: { id: env.uuid, display: env.name },
                actor: { type: 'api_key', id: accountKey.uuid, display: 'Key automation' },
                targets: [{ type: 'api_key', id: createdId, display: 'provisioned-ci' }],
                metadata: { displayName: 'provisioned-ci', scopes: ['environment:*'] }
            });
            expect(JSON.stringify(auditEvent('api_key', 'created'))).not.toContain(secret);

            auditSpy.mockClear();
            const deletion = await api.fetch('/environments/:environmentUuid/api-keys/:keyUuid', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentUuid: env.uuid, keyUuid: create.json.data.uuid }
            });

            expect(deletion.res.status).toBe(200);
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'deleted')).toBeDefined();
            });
            expect(auditEvent('api_key', 'deleted')).toMatchObject({
                resource: 'api_key',
                action: 'deleted',
                outcome: 'success',
                accountId: account.id,
                environment: { id: env.uuid, display: env.name },
                actor: { type: 'api_key', id: accountKey.uuid, display: 'Key automation' },
                targets: [{ type: 'api_key', id: createdId, display: 'provisioned-ci' }]
            });
        });

        it('records an api key creation without ever recording the secret value', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });

            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                token: apiKey.secret,
                // @ts-expect-error querystring is not typed on this endpoint
                query: { env: 'dev' },
                body: { display_name: 'ci-key', scopes: ['environment:*'] }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            const createdId = res.json.data.uuid;
            const secret = res.json.data.secret;
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'created')).toBeDefined();
            });
            const event = auditEvent('api_key', 'created');
            expect(event).toMatchObject({
                resource: 'api_key',
                action: 'created',
                outcome: 'success',
                targets: [{ type: 'api_key', id: createdId, display: 'ci-key' }],
                metadata: { displayName: 'ci-key', scopes: ['environment:*'] }
            });
            // The secret is present in the HTTP response but must never reach the audit record.
            expect(secret.length).toBeGreaterThan(0);
            expect(JSON.stringify(event)).not.toContain(secret);
        });

        it('records account API key creation and deletion without recording the secret', async () => {
            const { user } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });
            const session = await authenticateUser(api, user);

            const create = await api.fetch('/api/v1/account/api-keys', {
                method: 'POST',
                session,
                body: { display_name: 'account-automation' }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            const createdId = create.json.data.uuid;
            const secret = create.json.data.secret;
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'created')).toBeDefined();
            });
            expect(auditEvent('api_key', 'created')).toMatchObject({
                resource: 'api_key',
                action: 'created',
                outcome: 'success',
                environment: null,
                targets: [{ type: 'api_key', id: createdId, display: 'account-automation' }],
                metadata: { displayName: 'account-automation', scopes: ['account:*'] }
            });
            expect(JSON.stringify(auditEvent('api_key', 'created'))).not.toContain(secret);

            auditSpy.mockClear();
            const deletion = await api.fetch('/api/v1/account/api-keys/:keyId', {
                method: 'DELETE',
                params: { keyId: create.json.data.id },
                session
            });

            expect(deletion.res.status).toBe(200);
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'deleted')).toBeDefined();
            });
            expect(auditEvent('api_key', 'deleted')).toMatchObject({
                resource: 'api_key',
                action: 'deleted',
                outcome: 'success',
                environment: null,
                targets: [{ type: 'api_key', id: createdId, display: 'account-automation' }]
            });
        });

        it('records a private integration creation with the response unique_key as target', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });

            const res = await api.fetch('/api/v1/integrations', {
                method: 'POST',
                token: apiKey.secret,
                query: { env: 'dev' },
                body: {
                    provider: 'algolia',
                    useSharedCredentials: false,
                    integrationId: 'audit-private-algolia'
                }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            // The private path omits the key from the request — the target is resolved from the response body.
            const uniqueKey = res.json.data.unique_key;
            expect(uniqueKey.length).toBeGreaterThan(0);
            await vi.waitFor(() => {
                expect(auditEvent('integration', 'created')).toBeDefined();
            });
            expect(auditEvent('integration', 'created')).toMatchObject({
                resource: 'integration',
                action: 'created',
                outcome: 'success',
                targets: [{ type: 'integration', id: uniqueKey }],
                metadata: { provider: 'algolia' }
            });
        });

        it('records a failed integration creation targetless without reading the response body', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser({ plan: { has_audit_trail_control_plane: true } });

            const created = await api.fetch('/api/v1/integrations', {
                method: 'POST',
                token: apiKey.secret,
                query: { env: 'dev' },
                body: { provider: 'algolia', useSharedCredentials: false, integrationId: 'audit-dup-algolia' }
            });
            expect(created.res.status).toBe(200);
            isSuccess(created.json);
            auditSpy.mockClear();

            // The created-resource resolver reads `response.data.unique_key`; a failed create's body is
            // `{ error }` with no `data`, so running it on a non-success outcome would throw and log an error.
            // `logger.error` is inherited from a prototype shared by every audit logger, so spying it here
            // catches the middleware's own logger too.
            const auditLogger = getLogger('Audit');
            let errorProto: object = auditLogger;
            while (errorProto && !Object.prototype.hasOwnProperty.call(errorProto, 'error')) {
                errorProto = Object.getPrototypeOf(errorProto) as object;
            }
            const errorSpy = vi.spyOn(errorProto as { error: (...args: unknown[]) => unknown }, 'error');

            try {
                // Re-posting the same integrationId is rejected with a 400 whose body carries no `data`.
                const res = await api.fetch('/api/v1/integrations', {
                    method: 'POST',
                    token: apiKey.secret,
                    query: { env: 'dev' },
                    body: { provider: 'algolia', useSharedCredentials: false, integrationId: 'audit-dup-algolia' }
                });

                expect(res.res.status).toBe(400);
                await vi.waitFor(() => {
                    expect(auditSpy).toHaveBeenCalled();
                });
                // A failed create emits targetless (the id only exists on success) with a failure outcome.
                expect(auditSpy).toHaveBeenCalledTimes(1);
                expect(auditEvent('integration', 'created')).toMatchObject({
                    resource: 'integration',
                    action: 'created',
                    outcome: 'failure',
                    targets: []
                });
                // The resolver must be gated on success — it never ran, so nothing was logged for it.
                expect(errorSpy.mock.calls.some((call) => String(call[0]).includes('failed to resolve audit target from response'))).toBe(false);
            } finally {
                errorSpy.mockRestore();
            }
        });
    });
    describe('impersonation', () => {
        const adminUuid = envs.NANGO_ADMIN_UUID;
        afterEach(() => {
            flags.hasAdminCapabilities = false;
            envs.NANGO_IMPERSONATION_MFA_REQUIRED = true;
            envs.NANGO_ADMIN_UUID = adminUuid;
        });

        it('marks what an impersonated session does as reached through Nango', async () => {
            const admin = await seeders.seedAccountEnvAndUser();
            const target = await seeders.seedAccountEnvAndUser({ plan: { has_rbac: true, has_audit_trail_control_plane: true } });
            flags.hasAdminCapabilities = true;
            envs.NANGO_ADMIN_UUID = admin.account.uuid;
            // Breakglass, so the admin's own factor is out of scope here — postImpersonate covers the challenge.
            envs.NANGO_IMPERSONATION_MFA_REQUIRED = false;

            const impersonation = await api.fetch('/api/v1/admin/impersonate', {
                method: 'POST',
                session: await authenticateUser(api, admin.user),
                query: { env: 'dev' },
                body: { accountUUID: target.account.uuid, loginReason: 'support' }
            });
            expect(impersonation.res.status).toBe(200);
            // req.login regenerates the session, so the impersonated session is the cookie it replies with.
            const session = impersonation.res.headers.getSetCookie()[0]!.split(';')[0]!;
            // Seeded after the switch: impersonation logs in as "an user" of the account, which is
            // unambiguous only while the account has one.
            const targetUser = await seeders.seedUser(target.account.id);
            auditSpy.mockClear();

            const res = await api.fetch('/api/v1/team/users/:id', {
                method: 'DELETE',
                session,
                query: { env: 'dev' },
                params: { id: targetUser.id }
            });

            expect(res.res.status).toBe(200);
            await vi.waitFor(() => {
                expect(auditEvent('member', 'removed')).toBeDefined();
            });
            expect(auditEvent('member', 'removed')).toMatchObject({
                resource: 'member',
                action: 'removed',
                outcome: 'success',
                accountId: target.account.id,
                environment: null,
                actor: { type: 'user', id: String(target.user.id), display: target.user.email },
                targets: [{ type: 'member', id: String(targetUser.id), display: targetUser.email }],
                via: [
                    {
                        type: 'impersonation',
                        id: String(admin.account.id),
                        display: admin.account.name,
                        // The operator who impersonated, not the account's own user the session authenticates as.
                        actorId: String(admin.user.id)
                    }
                ]
            });
            // The operator is identified to us, never disclosed to the customer reading this.
            expect(JSON.stringify(auditEvent('member', 'removed')?.via)).not.toContain(admin.user.email);
        });
    });
});

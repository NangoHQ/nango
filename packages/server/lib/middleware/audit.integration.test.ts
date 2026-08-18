import { randomUUID } from 'node:crypto';

import simpleOauth2 from 'simple-oauth2';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { logContextGetter } from '@nangohq/logs';
import { customerKeyService, seeders, updatePlan, userService } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

import { audit } from '../audit.js';
import oAuthSessionService from '../services/oauth-session.service.js';
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
//   - connection creation, which is emitted from the connectionCreated hook rather than a middleware:
//     only a real request proves the hook runs and that the caller reaches it (api key, connect session).

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

        it('records a denied public environment mutation against the account', async () => {
            const { account } = await seeders.seedAccountEnvAndUser();
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
                actor: { type: 'api_key', id: String(accountKey.id), display: 'Production only' },
                metadata: { name: 'denied-environment' }
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

    // The id of a created resource is known only from the response body, so these specs resolve their
    // target with targetFromResponse — which only a real controller producing a real response can drive.
    describe('created-resource id from the real response', () => {
        it('records an integration creation with the created key and provider', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();

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
            const { plan, apiKey } = await seeders.seedAccountEnvAndUser();
            await updatePlan(db.knex, { id: plan.id, environments_max: 10 });

            const res = await api.fetch('/api/v1/environments', {
                method: 'POST',
                token: apiKey.secret,
                body: { name: 'staging' }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
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
            const { account, plan } = await seeders.seedAccountEnvAndUser();
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
            const createdId = String(create.json.data.id);
            await vi.waitFor(() => {
                expect(auditEvent('environment', 'created')).toBeDefined();
            });
            expect(auditEvent('environment', 'created')).toMatchObject({
                resource: 'environment',
                action: 'created',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                actor: { type: 'api_key', id: String(accountKey.id), display: 'Environment automation' },
                targets: [{ type: 'environment', id: createdId, display: 'public-staging' }],
                metadata: { name: 'public-staging' }
            });

            auditSpy.mockClear();
            const deletion = await api.fetch('/environments/:environmentId', {
                method: 'DELETE',
                token: accountKey.secret,
                params: { environmentId: create.json.data.id }
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
                actor: { type: 'api_key', id: String(accountKey.id), display: 'Environment automation' },
                targets: [{ type: 'environment', id: createdId, display: 'public-staging' }]
            });
        });

        it('records public environment API key creation and deletion with an Account API key', async () => {
            const { account, env } = await seeders.seedAccountEnvAndUser();
            const accountKey = (
                await customerKeyService.createAccountApiKey(db.knex, {
                    accountId: account.id,
                    displayName: 'Key automation',
                    scopes: ['account:*']
                })
            ).unwrap();

            const create = await api.fetch('/environment/api-keys', {
                method: 'POST',
                token: accountKey.secret,
                body: { environment_id: env.id, display_name: 'provisioned-ci' }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            const createdId = String(create.json.data.id);
            const secret = create.json.data.secret;
            await vi.waitFor(() => {
                expect(auditEvent('api_key', 'created')).toBeDefined();
            });
            expect(auditEvent('api_key', 'created')).toMatchObject({
                resource: 'api_key',
                action: 'created',
                outcome: 'success',
                accountId: account.id,
                environment: null,
                actor: { type: 'api_key', id: String(accountKey.id), display: 'Key automation' },
                targets: [{ type: 'api_key', id: createdId, display: 'provisioned-ci' }],
                metadata: { displayName: 'provisioned-ci', environmentId: env.id }
            });
            expect(JSON.stringify(auditEvent('api_key', 'created'))).not.toContain(secret);

            auditSpy.mockClear();
            const deletion = await api.fetch('/environment/api-keys', {
                method: 'DELETE',
                token: accountKey.secret,
                body: { environment_id: env.id, key_id: create.json.data.id }
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
                environment: null,
                actor: { type: 'api_key', id: String(accountKey.id), display: 'Key automation' },
                targets: [{ type: 'api_key', id: createdId, display: 'provisioned-ci' }],
                metadata: { environmentId: env.id }
            });
        });

        it('records an api key creation without ever recording the secret value', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();

            const res = await api.fetch('/api/v1/environment/api-keys', {
                method: 'POST',
                token: apiKey.secret,
                // @ts-expect-error querystring is not typed on this endpoint
                query: { env: 'dev' },
                body: { display_name: 'ci-key', scopes: ['environment:*'] }
            });

            expect(res.res.status).toBe(200);
            isSuccess(res.json);
            const createdId = String(res.json.data.id);
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
            const { user } = await seeders.seedAccountEnvAndUser();
            const session = await authenticateUser(api, user);

            const create = await api.fetch('/api/v1/account/api-keys', {
                method: 'POST',
                session,
                body: { display_name: 'account-automation' }
            });

            expect(create.res.status).toBe(200);
            isSuccess(create.json);
            const createdId = String(create.json.data.id);
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

        it('records a connection import with the server-generated connection_id when none is supplied', async () => {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github');

            const res = await api.fetch('/connections', {
                method: 'POST',
                token: apiKey.secret,
                body: { provider_config_key: 'github', credentials: { type: 'OAUTH2', access_token: '123' } }
            });

            expect(res.res.status).toBe(201);
            isSuccess(res.json);
            const generatedId = res.json.connection_id;
            expect(generatedId).toBeTruthy();

            await vi.waitFor(() => {
                expect(auditEvent('connection', 'created')).toBeDefined();
            });
            expect(auditEvent('connection', 'created')).toMatchObject({
                resource: 'connection',
                action: 'created',
                outcome: 'success',
                targets: [{ type: 'connection', id: generatedId }],
                metadata: { providerConfigKey: 'github' }
            });
        });

        // The OAuth callback is the busiest creation path and the only one where nothing on the request
        // identifies anyone: the provider issues the redirect, so the end user has to be recovered from the
        // session row the authorize leg wrote.
        it('attributes an OAuth callback creation to the end user on its connect session', async () => {
            const { account, env, apiKey } = await seeders.seedAccountEnvAndUser();
            await seeders.createConfigSeed(env, 'github', 'github', { oauth_client_id: 'a-client-id', oauth_client_secret: 'a-client-secret' });

            const session = await api.fetch('/connect/sessions', {
                method: 'POST',
                token: apiKey.secret,
                body: { end_user: { id: 'oauth-end-user', email: 'oauth@customer.com' } }
            });
            isSuccess(session.json);
            const [connectSession] = await db.knex
                .select<{ id: number }[]>('id')
                .from('connect_sessions')
                .where({ environment_id: env.id })
                .orderBy('id', 'desc')
                .limit(1);

            const logCtx = await logContextGetter.create({ operation: { type: 'auth', action: 'create_connection' } }, { account, environment: env });
            const state = randomUUID();
            await oAuthSessionService.create({
                id: state,
                providerConfigKey: 'github',
                provider: 'github',
                connectionId: 'oauth-callback-conn',
                callbackUrl: `${api.url}/oauth/callback`,
                authMode: 'OAUTH2',
                connectSessionId: connectSession!.id,
                connectionConfig: {},
                webhookUrlOverride: null,
                environmentId: env.id,
                webSocketClientId: undefined,
                activityLogId: logCtx.id,
                codeVerifier: 'code-verifier',
                requestTokenSecret: null,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            // The provider is the only part of the flow we cannot run for real.
            vi.spyOn(simpleOauth2.AuthorizationCode.prototype, 'getToken').mockResolvedValue({
                token: { access_token: 'an-access-token', token_type: 'bearer', expires_in: 3600 }
            } as never);

            const res = await fetch(`${api.url}/oauth/callback?state=${state}&code=an-auth-code`);
            expect(res.status, await res.text()).toBe(200);

            await vi.waitFor(() => {
                expect(auditEvent('connection', 'created')).toBeDefined();
            });
            expect(auditEvent('connection', 'created')).toMatchObject({
                resource: 'connection',
                action: 'created',
                outcome: 'success',
                actor: { type: 'connect_session', id: 'oauth-end-user', display: 'oauth@customer.com' },
                targets: [{ type: 'connection', id: 'oauth-callback-conn' }]
            });
        });

        // The Connect flow: the actor is the end user named by the session, which only the hook can see —
        // the request itself authenticates a session, not a person.
        it('attributes a connection created through a connect session to its end user', async () => {
            const { env, apiKey } = await seeders.seedAccountEnvAndUser();
            const config = await seeders.createConfigSeed(env, 'unauthenticated', 'unauthenticated');

            const session = await api.fetch('/connect/sessions', {
                method: 'POST',
                token: apiKey.secret,
                body: { end_user: { id: 'end-user-1', email: 'buyer@customer.com' } }
            });
            isSuccess(session.json);

            const res = await api.fetch('/auth/unauthenticated/:providerConfigKey', {
                method: 'POST',
                query: { connect_session_token: session.json.data.token },
                params: { providerConfigKey: config.unique_key }
            });
            isSuccess(res.json);

            await vi.waitFor(() => {
                expect(auditEvent('connection', 'created')).toBeDefined();
            });
            expect(auditEvent('connection', 'created')).toMatchObject({
                resource: 'connection',
                action: 'created',
                outcome: 'success',
                actor: { type: 'connect_session', id: 'end-user-1', display: 'buyer@customer.com' },
                targets: [{ type: 'connection', id: res.json.connectionId }]
            });
        });

        it('records a private integration creation with the response unique_key as target', async () => {
            const { apiKey } = await seeders.seedAccountEnvAndUser();

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
            const { apiKey } = await seeders.seedAccountEnvAndUser();

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
});

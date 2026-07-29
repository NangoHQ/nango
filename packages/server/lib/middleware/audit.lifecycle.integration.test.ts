import crypto from 'node:crypto';

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import db from '@nangohq/database';
import * as featureFlags from '@nangohq/feature-flags';
import { customerKeyService, inviteEmail, seeders, updatePlan, userService } from '@nangohq/shared';
import { getLogger } from '@nangohq/utils';

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

describe('audit middleware — lifecycle events (created / invited / deployed / paused / started)', () => {
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

    it('records one target per invited email', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite', {
            method: 'POST',
            session,
            query: { env: 'dev' },
            body: { emails: ['alice@example.com', 'bob@example.com'], role: 'administrator' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invited')).toBeDefined();
        });
        expect(auditEvent('member', 'invited')).toMatchObject({
            resource: 'member',
            action: 'invited',
            outcome: 'success',
            environment: null,
            targets: [
                { type: 'member', id: 'alice@example.com', display: 'alice@example.com' },
                { type: 'member', id: 'bob@example.com', display: 'bob@example.com' }
            ],
            metadata: { role: 'administrator' }
        });
    });

    it('records a denied invite (caller lacks the permission) with the invited email as target', async () => {
        const { user, plan } = await seeders.seedAccountEnvAndUser();
        await updatePlan(db.knex, { id: plan.id, has_rbac: true });
        // Demote the acting user so `can(canInviteMember)` rejects with 403 before the controller runs.
        await userService.update({ id: user.id, role: 'production_support' });
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite', {
            method: 'POST',
            session,
            query: { env: 'dev' },
            body: { emails: ['denied@example.com'], role: 'administrator' }
        });

        expect(res.res.status).toBe(403);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invited')).toBeDefined();
        });
        expect(auditEvent('member', 'invited')).toMatchObject({
            resource: 'member',
            action: 'invited',
            outcome: 'denied',
            targets: [{ type: 'member', id: 'denied@example.com', display: 'denied@example.com' }]
        });
    });

    it('records an invite revocation with the revoked email as target', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite', {
            method: 'DELETE',
            session,
            query: { env: 'dev' },
            body: { email: 'revoke-me@example.com' }
        });

        expect(res.res.status).toBe(200);
        isSuccess(res.json);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invite_revoked')).toBeDefined();
        });
        expect(auditEvent('member', 'invite_revoked')).toMatchObject({
            resource: 'member',
            action: 'invite_revoked',
            outcome: 'success',
            environment: null,
            targets: [{ type: 'member', id: 'revoke-me@example.com', display: 'revoke-me@example.com' }]
        });
    });

    it('records an invite acceptance with the accepting member as actor and target', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const invitation = await inviteEmail({
            email: user.email,
            name: user.email,
            accountId: account.id,
            invitedByUserId: user.id,
            role: 'administrator',
            trx: db.knex
        });
        if (!invitation) {
            throw new Error('failed to seed invitation');
        }
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite/:id', {
            // @ts-expect-error duplicate GET/POST path confuses api.fetch endpoint inference
            method: 'POST',
            session,
            params: { id: invitation.token }
        });

        expect(res.res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invite_accepted')).toBeDefined();
        });
        expect(auditEvent('member', 'invite_accepted')).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: user.email, display: user.email }]
        });
    });

    it('records an invite decline with the declining member as actor and target', async () => {
        const { account, user } = await seeders.seedAccountEnvAndUser();
        const invitation = await inviteEmail({
            email: user.email,
            name: user.email,
            accountId: account.id,
            invitedByUserId: user.id,
            role: 'administrator',
            trx: db.knex
        });
        if (!invitation) {
            throw new Error('failed to seed invitation');
        }
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite/:id', {
            // @ts-expect-error duplicate GET/DELETE path confuses api.fetch endpoint inference
            method: 'DELETE',
            session,
            params: { id: invitation.token }
        });

        expect(res.res.status).toBe(200);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invite_declined')).toBeDefined();
        });
        expect(auditEvent('member', 'invite_declined')).toMatchObject({
            resource: 'member',
            action: 'invite_declined',
            outcome: 'success',
            environment: null,
            actor: { type: 'user', id: String(user.id), display: user.email },
            targets: [{ type: 'member', id: user.email, display: user.email }]
        });
    });

    it('records a failed invite acceptance (invitation not found) with the acting member as target', async () => {
        const { user } = await seeders.seedAccountEnvAndUser();
        const session = await authenticateUser(api, user);

        const res = await api.fetch('/api/v1/invite/:id', {
            // @ts-expect-error duplicate GET/POST path confuses api.fetch endpoint inference
            method: 'POST',
            session,
            params: { id: crypto.randomUUID() }
        });

        expect(res.res.status).toBe(400);
        await vi.waitFor(() => {
            expect(auditEvent('member', 'invite_accepted')).toBeDefined();
        });
        expect(auditEvent('member', 'invite_accepted')).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'failure',
            targets: [{ type: 'member', id: user.email, display: user.email }]
        });
    });

    it('records a bulk CLI deploy with one target per flow', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/sync/deploy', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                // The deploy may be rejected downstream, but the audit target is resolved from the
                // request before the handler runs, so the flow targets are recorded regardless.
                flowConfigs: [
                    {
                        type: 'sync',
                        syncName: 'flow-a',
                        providerConfigKey: 'algolia',
                        models: [],
                        runs: 'every day',
                        track_deletes: false,
                        fileBody: { js: '', ts: '' }
                    },
                    {
                        type: 'action',
                        syncName: 'flow-b',
                        providerConfigKey: 'algolia',
                        models: [],
                        runs: null,
                        track_deletes: false,
                        fileBody: { js: '', ts: '' }
                    }
                ],
                nangoYamlBody: '',
                reconcile: false,
                debug: false
            }
        });

        expect(res.res.status).not.toBe(404);
        await vi.waitFor(() => {
            expect(auditEvent('function', 'deployed')).toBeDefined();
        });
        expect(auditEvent('function', 'deployed')).toMatchObject({
            resource: 'function',
            action: 'deployed',
            targets: [
                { type: 'function', id: 'flow-a', display: 'sync' },
                { type: 'function', id: 'flow-b', display: 'action' }
            ]
        });
    });

    it('records a pre-built flow upgrade with the script name and metadata', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/api/v1/flows/pre-built/upgrade', {
            method: 'PUT',
            token: apiKey.secret,
            query: { env: 'dev' },
            body: {
                id: 1,
                provider: 'algolia',
                scriptName: 'my-sync',
                type: 'sync',
                upgradeVersion: '2.0.0',
                lastDeployed: new Date().toISOString(),
                providerConfigKey: 'algolia'
            }
        });

        // The upgrade itself is rejected (no matching flow), but the audit target is resolved from the
        // request body before the handler runs.
        expect(res.res.status).not.toBe(401);
        await vi.waitFor(() => {
            expect(auditEvent('function', 'upgraded')).toBeDefined();
        });
        expect(auditEvent('function', 'upgraded')).toMatchObject({
            resource: 'function',
            action: 'upgraded',
            targets: [{ type: 'function', id: 'my-sync' }],
            metadata: { providerConfigKey: 'algolia', upgradeVersion: '2.0.0' }
        });
    });

    it('records a connection creation without ever recording credentials', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/connections', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                connection_id: 'audit-conn',
                provider_config_key: 'algolia',
                credentials: { type: 'API_KEY', apiKey: 'super-secret-credential' }
            }
        });

        await vi.waitFor(() => {
            expect(auditEvent('connection', 'created')).toBeDefined();
        });
        const event = auditEvent('connection', 'created');
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'created',
            targets: [{ type: 'connection', id: 'audit-conn' }],
            metadata: { providerConfigKey: 'algolia' }
        });
        // Credentials are in the request body but must never reach the audit record.
        expect(JSON.stringify(event)).not.toContain('super-secret-credential');
        // Guard against status drift — the audit runs after auth, before the controller.
        expect(res.res.status).not.toBe(401);
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
        // The request omitted connection_id, so the target can only come from the response body.
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

    it('records a sync pause with one target per sync', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/sync/pause', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }],
                provider_config_key: 'algolia'
            }
        });

        expect(res.res.status).not.toBe(401);
        await vi.waitFor(() => {
            expect(auditEvent('sync', 'paused')).toBeDefined();
        });
        expect(auditEvent('sync', 'paused')).toMatchObject({
            resource: 'sync',
            action: 'paused',
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b', display: 'v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('records a sync start with one target per sync', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/sync/start', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }],
                provider_config_key: 'algolia'
            }
        });

        expect(res.res.status).not.toBe(401);
        await vi.waitFor(() => {
            expect(auditEvent('sync', 'started')).toBeDefined();
        });
        expect(auditEvent('sync', 'started')).toMatchObject({
            resource: 'sync',
            action: 'started',
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b', display: 'v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('records a single-function deployment with the function name as target', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/functions/deployments', {
            method: 'POST',
            token: apiKey.secret,
            body: {
                type: 'function',
                integration_id: 'algolia',
                function_name: 'my-func',
                function_type: 'action',
                code: ''
            }
        });

        // The deploy may be rejected downstream, but the audit target is resolved from the request body
        // before the handler runs, so it is recorded regardless of outcome.
        expect(res.res.status).not.toBe(401);
        await vi.waitFor(() => {
            expect(auditEvent('function', 'deployed')).toBeDefined();
        });
        expect(auditEvent('function', 'deployed')).toMatchObject({
            resource: 'function',
            action: 'deployed',
            targets: [{ type: 'function', id: 'my-func' }],
            metadata: { providerConfigKey: 'algolia', type: 'action' }
        });
    });

    it('records a denied deployment (caller lacks environment:deploy scope)', async () => {
        const { env, apiKey } = await seeders.seedAccountEnvAndUser();
        // Restrict the key so withScope('environment:deploy') rejects with 403 before the controller runs.
        (await customerKeyService.updateApiKeyScopes(db.knex, apiKey.id, ['environment:integrations:list'], env.id)).unwrap();

        const res = await api.fetch('/functions/deployments', {
            method: 'POST',
            token: apiKey.secret,
            body: { type: 'function', integration_id: 'algolia', function_name: 'denied-func', function_type: 'action', code: '' }
        });

        // The audit middleware now runs between auth and the scope check, so the denial is still recorded.
        expect(res.res.status).toBe(403);
        await vi.waitFor(() => {
            expect(auditEvent('function', 'deployed')).toBeDefined();
        });
        expect(auditEvent('function', 'deployed')).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'denied',
            targets: [{ type: 'function', id: 'denied-func' }]
        });
    });

    it('records a pre-built flow deploy with the script name as target', async () => {
        const { apiKey } = await seeders.seedAccountEnvAndUser();

        const res = await api.fetch('/api/v1/flows/pre-built/deploy', {
            method: 'POST',
            token: apiKey.secret,
            query: { env: 'dev' },
            body: {
                providerConfigKey: 'algolia',
                scriptName: 'my-prebuilt-sync',
                type: 'sync'
            }
        });

        // The deploy is rejected (no matching template), but the audit target is resolved from the request body.
        expect(res.res.status).not.toBe(401);
        await vi.waitFor(() => {
            expect(auditEvent('function', 'deployed')).toBeDefined();
        });
        expect(auditEvent('function', 'deployed')).toMatchObject({
            resource: 'function',
            action: 'deployed',
            targets: [{ type: 'function', id: 'my-prebuilt-sync' }],
            metadata: { providerConfigKey: 'algolia', type: 'sync' }
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

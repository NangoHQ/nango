import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import {
    auditConnectionCreated,
    auditConnectionUpdated,
    auditEnvironmentUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhookUrlsChanged,
    auditFunctionDeleted,
    auditFunctionDeployedCli,
    auditFunctionDeployedFromTemplate,
    auditFunctionDeploymentBundle,
    auditFunctionUpgraded,
    auditIntegrationCreated,
    auditIntegrationDeleted,
    auditIntegrationUpdated,
    auditMemberInviteAccepted,
    auditMemberInvited,
    auditMemberInviteDeclined,
    auditMemberInviteRevoked,
    auditMfaEnabled,
    auditPreBuiltDeployed,
    auditPublicConnectionDeleted,
    auditPublicFunctionDeleted,
    auditPublicIntegrationDeleted,
    auditSyncPaused,
    auditSyncStarted,
    auditSyncTriggered,
    auditUserUpdated,
    resolveActor
} from './audit.middleware.js';

import type * as AuditModule from '../audit.js';
import type * as NangoShared from '@nangohq/shared';
import type { RequestHandler } from 'express';

const recordMock = vi.hoisted(() => vi.fn());
vi.mock('../audit.js', async (importOriginal) => {
    const actual = await importOriginal<typeof AuditModule>();
    return { ...actual, audit: { record: recordMock } };
});

// invite accept/decline resolve the audited account from the invitation (see AuditSpec.account).
const getInvitationMock = vi.hoisted(() => vi.fn());
const getAccountByIdMock = vi.hoisted(() => vi.fn());
const getPlanSafeMock = vi.hoisted(() => vi.fn());
const getIntegrationSummaryMock = vi.hoisted(() => vi.fn());
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return {
        ...actual,
        getInvitation: getInvitationMock,
        getPlanSafe: getPlanSafeMock,
        configService: { ...actual.configService, getIntegrationSummary: getIntegrationSummaryMock },
        accountService: { ...actual.accountService, getAccountById: getAccountByIdMock }
    };
});

function fakeReq(overrides: Record<string, unknown> = {}) {
    return {
        params: {},
        query: {},
        body: {},
        ip: '203.0.113.7',
        get: (h: string) => (h.toLowerCase() === 'user-agent' ? 'vitest' : undefined),
        ...overrides
    } as any;
}

function fakeRes(locals: Record<string, unknown>, statusCode = 200) {
    const res = new EventEmitter() as any;
    res.locals = locals;
    res.statusCode = statusCode;
    res.json = (body: unknown) => body;
    return res;
}

const locals = {
    account: { id: 42, uuid: 'acc-uuid' },
    environment: { id: 9, name: 'dev' },
    authType: 'session',
    user: { id: 7, email: 'dev@example.com' }
};

const secretKeyLocals = {
    account: { id: 42, uuid: 'acc-uuid' },
    environment: { id: 9, name: 'dev' },
    authType: 'secretKey',
    apiKeyId: 5,
    apiKeyDisplayName: 'ci-key'
};

// Invoke the middleware, wait for it to call next() (resolution done), fire the response 'finish'
// event that triggers the emit, and return the recorded event.
async function runAudit(handler: RequestHandler, req: any, res: any) {
    await new Promise<void>((resolve) => handler(req, res, () => resolve()));
    res.emit('finish');
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
    return recordMock.mock.calls[0]?.[0];
}

describe('auditable() middleware behavior (unit)', () => {
    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue({ isErr: () => false });
        // No plans in a unit run, so the entitlement path resolves off; the deployment opt-in is what
        // reaches the middleware. Which gate lets a request through is covered in utils/auditTrail.unit.test.ts.
        flags.hasAuditTrail = true;
        getIntegrationSummaryMock.mockReset().mockResolvedValue({ provider: 'algolia', display_name: 'Algolia Prod' });
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
    });

    it('user update: records the fields it accepts, so a profile rename is not a banner dismissal', async () => {
        const req = fakeReq({ body: { name: 'Ada Lovelace' } });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'user',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'user', id: '7', display: 'dev@example.com' }],
            metadata: { name: 'Ada Lovelace' }
        });
        expect(event?.metadata).not.toHaveProperty('gettingStartedClosed');
    });

    it('user update: a dismissed banner is distinguishable from a rename', async () => {
        const req = fakeReq({ body: { gettingStartedClosed: true } });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'user', action: 'updated', accountId: 42, outcome: 'success' });
        expect(event?.metadata).toEqual({ gettingStartedClosed: true });
        expect(event?.metadata).not.toHaveProperty('name');
    });

    it.each([
        ['a non-string name', { name: 42 }],
        ['an empty name', { name: '' }],
        ['a non-boolean flag', { gettingStartedClosed: 'yes' }]
    ])('user update: %s cannot reach the row, since nothing has validated the body yet', async (_name, body) => {
        const req = fakeReq({ body });
        const event = await runAudit(auditUserUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'user', action: 'updated', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
    });

    it('environment update: an empty name is omitted rather than recorded', async () => {
        const event = await runAudit(auditEnvironmentUpdated, fakeReq({ body: { name: '', hmac_enabled: true } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'environment', action: 'updated', accountId: 42, environment: { id: 9, display: 'dev' } });
        expect(event?.metadata).toEqual({ changedFields: ['name', 'hmac_enabled'] });
    });

    it('environment update: echoes the name but never a credential in the same body', async () => {
        const req = fakeReq({
            body: { name: 'staging', hmac_key: 'super-secret-hmac', otlp_headers: [{ name: 'authorization', value: 'Bearer super-secret-token' }] }
        });
        const event = await runAudit(auditEnvironmentUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { name: 'staging', changedFields: ['name', 'hmac_key', 'otlp_headers'] }
        });
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-hmac');
        expect(serialized).not.toContain('super-secret-token');
    });

    it('builds the event and records variable names but never their values', async () => {
        const req = fakeReq({
            body: {
                variables: [
                    { name: 'API_URL', value: 'https://secret.example' },
                    { name: 'TOKEN', value: 'super-secret-value' }
                ]
            }
        });
        const event = await runAudit(auditEnvironmentVariablesChanged, req, fakeRes(locals));

        expect(event).toMatchObject({
            resource: 'environment',
            action: 'variables_changed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { variableCount: 2, variableNames: ['API_URL', 'TOKEN'] },
            context: { interface: 'api', ip: '203.0.113.7', userAgent: 'vitest' }
        });
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-value');
        expect(serialized).not.toContain('secret.example');
    });

    it('marks an event reached through an impersonation session, naming the Nango account', async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            session: { impersonatedBy: { accountId: 1, accountName: 'Nango', actorId: 7 } }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ accountId: 42, via: [{ type: 'impersonation', id: '1', display: 'Nango', actorId: '7' }] });
        expect(event?.via?.[0]).not.toHaveProperty('actorDisplay');
    });

    it('marks a session that predates the operator id, without inventing one', async () => {
        const req = fakeReq({
            body: { variables: [] },
            session: { impersonatedBy: { accountId: 1, accountName: 'Nango' } }
        });
        const event = await runAudit(auditEnvironmentVariablesChanged, req, fakeRes(locals));
        expect(event?.via).toEqual([{ type: 'impersonation', id: '1', display: 'Nango' }]);
    });

    it("leaves the impersonating account's own trail unmarked", async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            // locals.account is 42, so this is Nango acting on Nango — nothing to say.
            session: { impersonatedBy: { accountId: 42, accountName: 'Nango' } }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({ accountId: 42 });
        expect(event).not.toHaveProperty('via');
    });

    it('connection update: records changed field names + provider, never the submitted value', async () => {
        const req = fakeReq({
            params: { connectionId: 'conn-1' },
            query: { provider_config_key: 'algolia' },
            body: { webhook_url_override: 'https://leaked-value.test/hook' }
        });
        const event = await runAudit(auditConnectionUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'updated',
            outcome: 'success',
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia', changedFields: ['webhook_url_override'] }
        });
        expect(JSON.stringify(event)).not.toContain('leaked-value');
    });

    it.each([
        ['private', auditIntegrationDeleted, { providerConfigKey: 'algolia-prod' }],
        ['public', auditPublicIntegrationDeleted, { uniqueKey: 'algolia-prod' }]
    ])('integration delete (%s): captures the provider and the name before the row is gone', async (_surface, handler, params) => {
        const event = await runAudit(handler, fakeReq({ params }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'integration',
            action: 'deleted',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'integration', id: 'algolia-prod', display: 'Algolia Prod' }],
            metadata: { provider: 'algolia' }
        });
        expect(getIntegrationSummaryMock).toHaveBeenCalledWith(9, 'algolia-prod');
    });

    it('integration delete: a failed lookup still records the deletion', async () => {
        getIntegrationSummaryMock.mockRejectedValue(new Error('db down'));
        const event = await runAudit(auditIntegrationDeleted, fakeReq({ params: { providerConfigKey: 'algolia-prod' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'integration', action: 'deleted', accountId: 42, targets: [{ type: 'integration', id: 'algolia-prod' }] });
        expect(event?.targets?.[0]).not.toHaveProperty('display');
        expect(event?.metadata).toBeUndefined();
    });

    it('integration update: records the provider next to the changed fields, never a credential value', async () => {
        const req = fakeReq({ params: { providerConfigKey: 'algolia-prod' }, body: { credentials: { client_secret: 'super-secret-value' } } });
        const event = await runAudit(auditIntegrationUpdated, req, fakeRes(locals));
        expect(event?.metadata).toEqual({ provider: 'algolia', changedFields: ['credentials'] });
        expect(JSON.stringify(event)).not.toContain('super-secret-value');
    });

    it('integration create: takes the display from the response, since the key may be derived from the provider', async () => {
        const req = fakeReq({ body: { provider: 'unauthenticated' } });
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => auditIntegrationCreated(req, res, () => resolve()));
        res.json({ data: { unique_key: 'unauthenticated', display_name: 'Unauthenticated' } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'integration',
            action: 'created',
            accountId: 42,
            targets: [{ type: 'integration', id: 'unauthenticated', display: 'Unauthenticated' }],
            metadata: { provider: 'unauthenticated' }
        });
    });

    it('connection create: a failed attempt names the integration from the path and the connection from the query', async () => {
        const req = fakeReq({ params: { providerConfigKey: 'algolia' }, query: { connection_id: 'conn-a' } });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'created',
            outcome: 'failure',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'connection', id: 'conn-a' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('connection create: a failed attempt on POST /connections reads the body instead', async () => {
        const req = fakeReq({ body: { provider_config_key: 'algolia', connection_id: 'conn-b' } });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            outcome: 'failure',
            accountId: 42,
            targets: [{ type: 'connection', id: 'conn-b' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('connection create: no caller-supplied connection id leaves the target empty, never a placeholder', async () => {
        const event = await runAudit(auditConnectionCreated, fakeReq({ params: { providerConfigKey: 'algolia' } }), fakeRes(locals, 400));
        expect(event).toMatchObject({ resource: 'connection', action: 'created', outcome: 'failure', accountId: 42 });
        expect(event?.targets).toEqual([]);
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia' });
    });

    it('connection create: the OAuth callback carries neither, so it still records the attempt and nothing more', async () => {
        const event = await runAudit(auditConnectionCreated, fakeReq({ body: undefined }), fakeRes(locals, 400));
        expect(event).toMatchObject({ resource: 'connection', action: 'created', outcome: 'failure', accountId: 42, targets: [] });
        expect(event?.metadata).toBeUndefined();
    });

    it('connection create: what the handler upserted wins over the request', async () => {
        const req = fakeReq({
            params: { providerConfigKey: 'from-path' },
            query: { connection_id: 'from-query' },
            audit: {
                connectionUpsert: {
                    operation: 'creation',
                    connectionId: 'conn-real',
                    providerConfigKey: 'algolia',
                    account: locals.account,
                    environment: locals.environment
                }
            }
        });
        const event = await runAudit(auditConnectionCreated, req, fakeRes(locals));
        expect(event).toMatchObject({
            outcome: 'success',
            targets: [{ type: 'connection', id: 'conn-real' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('webhook settings: records only the URL origin, never the path or secret query params', async () => {
        const req = fakeReq({ body: { primary_url: 'https://hooks.example/primary?token=shh-secret' } });
        const event = await runAudit(auditEnvironmentWebhookUrlsChanged, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            metadata: { changedFields: ['primary_url'], primaryUrl: 'https://hooks.example' }
        });
        expect(JSON.stringify(event)).not.toContain('shh-secret');
    });

    it('webhook settings: a toggled notification is recorded, though the endpoint only ever named URLs', async () => {
        const req = fakeReq({ body: { on_auth_creation: true, on_sync_error: false } });
        const event = await runAudit(auditEnvironmentWebhookUrlsChanged, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            metadata: { changedFields: ['on_auth_creation', 'on_sync_error'] }
        });
        expect(event?.metadata).not.toHaveProperty('primaryUrl');
        expect(event?.metadata).not.toHaveProperty('secondaryUrl');
    });

    it('maps the response status to an outcome (403 → denied, 5xx → failure)', async () => {
        const denied = await runAudit(auditEnvironmentVariablesChanged, fakeReq({ body: { variables: [] } }), fakeRes(locals, 403));
        expect(denied).toMatchObject({ outcome: 'denied' });
        recordMock.mockClear();
        const failed = await runAudit(auditEnvironmentVariablesChanged, fakeReq({ body: { variables: [] } }), fakeRes(locals, 500));
        expect(failed).toMatchObject({ outcome: 'failure' });
    });

    it('mfa activation: failure outcome on a rejected code, and the submitted code is never recorded', async () => {
        const req = fakeReq({ body: { code: '000000' } });
        const event = await runAudit(auditMfaEnabled, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'mfa',
            action: 'enabled',
            outcome: 'failure',
            accountId: 42,
            // account-scoped policy → environment is never attributed.
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'user', id: '7', display: 'dev@example.com' }]
        });
        expect(JSON.stringify(event)).not.toContain('000000');
    });

    it('resolves an api_key actor (secret-key auth) rather than a user', async () => {
        const apiKeyLocals = {
            account: { id: 42, uuid: 'acc-uuid' },
            environment: { id: 9, name: 'dev' },
            authType: 'secretKey',
            apiKeyId: 5,
            apiKeyDisplayName: 'ci-key'
        };
        const req = fakeReq({ params: { connectionId: 'conn-1' }, query: { provider_config_key: 'algolia' } });
        const event = await runAudit(auditPublicConnectionDeleted, req, fakeRes(apiKeyLocals));
        expect(event).toMatchObject({
            resource: 'connection',
            action: 'deleted',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'api_key', id: '5', display: 'ci-key' },
            targets: [{ type: 'connection', id: 'conn-1' }],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    // The per-account entitlement branch needs plans enabled, so it lives in audit.integration.test.ts.
    it('records nothing when the audit trail is not enabled', async () => {
        flags.hasAuditTrail = false;
        const req = fakeReq({ body: { variables: [{ name: 'X', value: 'y' }] } });
        const res = fakeRes(locals);

        await new Promise<void>((resolve) => auditEnvironmentVariablesChanged(req, res, () => resolve()));
        res.emit('finish');
        // Give the fire-and-forget finish hook a tick, then confirm the gate short-circuited it.
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('resolves the target BEFORE next() — a later mutation of res.locals cannot change it', async () => {
        const req = fakeReq({ body: { variables: [{ name: 'X', value: 'y' }] } });
        const res = fakeRes({ ...locals, environment: { id: 9, name: 'dev' } });

        await new Promise<void>((resolve) => auditEnvironmentVariablesChanged(req, res, () => resolve()));
        // Simulate a controller swapping the environment out after the middleware yielded.
        res.locals.environment = { id: 999, name: 'moved' };
        res.emit('finish');

        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        // Target was captured pre-next, so it still points at the original environment.
        expect(recordMock.mock.calls[0]?.[0]?.targets).toEqual([{ type: 'environment', id: '9', display: 'dev' }]);
    });
});

// Lifecycle specs whose target and metadata come entirely from the request (body/params/query) and
// res.locals — no live stack needed. The created-resource specs that read the response body
// (targetFromResponse) stay in audit.integration.test.ts.
describe('auditable() lifecycle specs (unit)', () => {
    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue({ isErr: () => false });
        flags.hasAuditTrail = true;
        getPlanSafeMock.mockReset().mockResolvedValue(null);
        // Invite accept/decline attribute to the inviting team (account 100), not the caller's account (42).
        getInvitationMock.mockReset().mockResolvedValue({ account_id: 100, email: 'dev@example.com', role: 'administrator' });
        getAccountByIdMock.mockReset().mockResolvedValue({ id: 100, uuid: 'inviting-acc-uuid', name: 'Inviting Team' });
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
    });

    it('member invited: one target per email, account-scoped (environment null)', async () => {
        const req = fakeReq({ body: { emails: ['alice@example.com', 'bob@example.com'], role: 'administrator' } });
        const event = await runAudit(auditMemberInvited, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invited',
            outcome: 'success',
            accountId: 42,
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [
                { type: 'member', id: 'alice@example.com', display: 'alice@example.com' },
                { type: 'member', id: 'bob@example.com', display: 'bob@example.com' }
            ],
            metadata: { role: 'administrator' }
        });
    });

    it('invite revoked: the revoked email is the target, account-scoped', async () => {
        const req = fakeReq({ body: { email: 'revoke-me@example.com' } });
        const event = await runAudit(auditMemberInviteRevoked, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_revoked',
            outcome: 'success',
            accountId: 42,
            environment: null,
            targets: [{ type: 'member', id: 'revoke-me@example.com', display: 'revoke-me@example.com' }]
        });
    });

    it('invite accepted: recorded under the inviting team, actor and target are the accepting member', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals));
        expect(getInvitationMock).toHaveBeenCalledWith('invite-token');
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'success',
            // The inviting team (from the invitation), not the accepter's own account (42).
            accountId: 100,
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });

    it('invite accepted: the entitlement is resolved for the inviting team, not the caller account', async () => {
        // The caller is account 42; the invitation attributes the event to team 100. The gate has to read
        // team 100's entitlement, so the plan lookup must be for that account and not the caller's.
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals));
        expect(event).toMatchObject({ resource: 'member', action: 'invite_accepted', accountId: 100 });
        expect(getPlanSafeMock).toHaveBeenCalledWith(expect.anything(), { accountId: 100 });
    });

    it('invite declined: recorded under the inviting team, actor and target are the declining member', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteDeclined, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_declined',
            outcome: 'success',
            accountId: 100,
            environment: null,
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });

    it('invite accept for an unknown invitation records nothing (no account to attribute to)', async () => {
        getInvitationMock.mockResolvedValue(null);
        const req = fakeReq({ params: { id: 'missing-token' } });
        await new Promise<void>((resolve) => auditMemberInviteAccepted(req, fakeRes(locals), () => resolve()));
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('failed invite acceptance (4xx): target still resolved from the session, outcome failure', async () => {
        const req = fakeReq({ params: { id: 'invite-token' } });
        const event = await runAudit(auditMemberInviteAccepted, req, fakeRes(locals, 400));
        expect(event).toMatchObject({
            resource: 'member',
            action: 'invite_accepted',
            outcome: 'failure',
            accountId: 100,
            environment: null,
            targets: [{ type: 'member', id: '7', display: 'dev@example.com' }]
        });
    });

    // A deploy and a later delete of the same function have to group, so every function event names the
    // integration in the id.
    it.each([
        ['private', auditFunctionDeleted, { providerConfigKey: 'algolia', functionName: 'contacts' }],
        ['public', auditPublicFunctionDeleted, { uniqueKey: 'algolia', name: 'contacts' }]
    ])('%s function delete: the target matches what a deploy recorded', async (_name, handler, params) => {
        const req = fakeReq({ params, query: { type: 'sync' } });
        const event = await runAudit(handler as RequestHandler, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deleted',
            outcome: 'success',
            targets: [{ type: 'function', id: 'algolia:contacts' }]
        });
        expect(event?.metadata).toEqual({ type: 'sync' });
    });

    it('bulk CLI deploy: one target per flow, naming the integration it went to', async () => {
        const req = fakeReq({
            body: {
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
        const event = await runAudit(auditFunctionDeployedCli, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'api_key', id: '5', display: 'ci-key' },
            targets: [
                { type: 'function', id: 'algolia:flow-a' },
                { type: 'function', id: 'algolia:flow-b' }
            ]
        });
        // The controller defaults the source the same way, and that default is what gets persisted.
        expect(event?.metadata).toEqual({ source: 'repo' });
    });

    it('native function bundle deploy: one target per function without recording source code', async () => {
        const req = fakeReq({
            body: {
                functions: [
                    { integrationId: 'github', name: 'fetchIssues', fileBody: { js: 'secret compiled code', ts: 'secret source code' } },
                    { integrationId: 'gitlab', name: 'fetchIssues', fileBody: { js: 'other compiled code', ts: 'other source code' } }
                ]
            }
        });
        const event = await runAudit(auditFunctionDeploymentBundle, req, fakeRes(secretKeyLocals));

        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'api_key', id: '5', display: 'ci-key' },
            targets: [
                { type: 'function', id: 'github:fetchIssues' },
                { type: 'function', id: 'gitlab:fetchIssues' }
            ],
            metadata: { type: 'function' }
        });
        expect(JSON.stringify(event)).not.toContain('secret');
    });

    it('pre-built flow upgrade: the script name is the target, provider + version in metadata', async () => {
        const req = fakeReq({
            body: { id: 1, provider: 'algolia', scriptName: 'my-sync', type: 'sync', upgradeVersion: '2.0.0', providerConfigKey: 'algolia' }
        });
        const event = await runAudit(auditFunctionUpgraded, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'upgraded',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:my-sync' }],
            metadata: { upgradeVersion: '2.0.0' }
        });
    });

    it('sync pause: one target per sync, the variant inside the id', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b::v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it.each([
        ['pause', auditSyncPaused],
        ['start', auditSyncStarted],
        ['trigger', auditSyncTriggered]
    ])('sync %s: names the connection the action was scoped to', async (_name, handler) => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 'algolia', connection_id: 'conn-1' } });
        const event = await runAudit(handler as RequestHandler, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toMatchObject({ providerConfigKey: 'algolia', connectionId: 'conn-1' });
    });

    it.each([
        ['pause', auditSyncPaused],
        ['start', auditSyncStarted]
    ])('sync %s: records no connection when the request scoped to the whole integration', async (_name, handler) => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 'algolia' } });
        const event = await runAudit(handler as RequestHandler, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia' });
    });

    it('sync pause: leaves out body values that are not strings, since nothing has validated them yet', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 12345, connection_id: {} } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toBeUndefined();
    });

    it('sync trigger: records the options the caller asked for, alongside the targets', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b::v2' }
            ],
            metadata: { providerConfigKey: 'algolia', reset: false, emptyCache: false }
        });
    });

    it('sync trigger: records emptyCache as asked, without inferring what the run will do with it', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 'algolia', opts: { emptyCache: true } } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', reset: false, emptyCache: true });
    });

    it('sync trigger: keeps the name::variant form as the id', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a::v1'], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.targets).toEqual([{ type: 'sync', id: 'sync-a::v1' }]);
    });

    it('sync trigger: records what it can when the body never parsed', async () => {
        const req = fakeReq({
            body: undefined,
            get: (h: string) => (h.toLowerCase() === 'provider-config-key' ? 'algolia' : undefined)
        });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({ resource: 'sync', action: 'triggered', targets: [] });
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', reset: false, emptyCache: false });
    });

    it('sync trigger: takes the integration and connection from the headers when the body omits them', async () => {
        const headers: Record<string, string> = { 'provider-config-key': 'algolia', 'connection-id': 'conn-1', 'user-agent': 'vitest' };
        const req = fakeReq({ body: { syncs: ['sync-a'] }, get: (h: string) => headers[h.toLowerCase()] });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', connectionId: 'conn-1', reset: false, emptyCache: false });
    });

    it.each([
        ['a non-boolean emptyCache', { opts: { emptyCache: 'yes please' } }],
        ['a non-boolean reset', { opts: { reset: 1 } }],
        ['an unknown sync_mode', { sync_mode: 'sideways' }],
        ['a non-boolean full_resync', { full_resync: 'true' }]
    ])('sync trigger: %s cannot reach the row, since nothing has validated the body yet', async (_name, body) => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 'algolia', ...body } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', reset: false, emptyCache: false });
    });

    it.each([
        ['incremental sync_mode', { sync_mode: 'incremental' }, { reset: false, emptyCache: false }],
        ['full_refresh sync_mode', { sync_mode: 'full_refresh' }, { reset: true, emptyCache: false }],
        ['full_refresh_and_clear_cache sync_mode', { sync_mode: 'full_refresh_and_clear_cache' }, { reset: true, emptyCache: true }],
        ['deprecated full_resync', { full_resync: true }, { reset: true, emptyCache: false }],
        ['opts.reset with opts.emptyCache', { opts: { reset: true, emptyCache: true } }, { reset: true, emptyCache: true }]
    ])('sync trigger: %s is recorded as the options asked for', async (_name, body, expected) => {
        const req = fakeReq({ body: { syncs: ['sync-a'], ...body } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual(expected);
    });

    it('sync start: one target per sync, the variant inside the id', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncStarted, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'started',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b::v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it('template deploy through the API: recorded as a catalog deploy', async () => {
        const req = fakeReq({ body: { type: 'template', integration_id: 'algolia', template: 'contacts', function_type: 'sync' } });
        const event = await runAudit(auditFunctionDeployedFromTemplate, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:contacts' }],
            metadata: { source: 'catalog', type: 'sync' }
        });
    });

    it.each([
        ['an unknown type', 'bogus'],
        ['no type at all', undefined]
    ])('records nothing for %s', async (_name, type) => {
        const req = fakeReq({ body: { ...(type ? { type } : {}), integration_id: 'algolia', template: 'contacts' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditFunctionDeployedFromTemplate(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('code deploy through the API records nothing: the sandbox CLI deploy is what gets recorded', async () => {
        const req = fakeReq({ body: { type: 'function', integration_id: 'algolia', function_name: 'my-func', function_type: 'action', code: '' } });
        const res = fakeRes(secretKeyLocals);
        await new Promise<void>((resolve) => auditFunctionDeployedFromTemplate(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('pre-built template deploy: the same shape as the API catalog deploy', async () => {
        const req = fakeReq({ body: { providerConfigKey: 'algolia', scriptName: 'my-prebuilt-sync', type: 'sync' } });
        const event = await runAudit(auditPreBuiltDeployed, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'function', id: 'algolia:my-prebuilt-sync' }]
        });
        expect(event?.metadata).toEqual({ source: 'catalog', type: 'sync' });
    });
});

describe('resolveActor (unit)', () => {
    const account = { id: 42, uuid: 'acc-uuid' };

    it.each(['publicKey', undefined] as const)('is unknown for an unattributed caller (authType %s)', (authType) => {
        expect(resolveActor({ authType, account } as any)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });

    it('names the end user behind a connect session, with their email as display', () => {
        const endUser = { endUserId: 'customer-user-1', email: 'buyer@customer.com', tags: null };
        expect(resolveActor({ authType: 'connectSession', account, endUser } as any)).toEqual({
            type: 'connect_session',
            id: 'customer-user-1',
            display: 'buyer@customer.com'
        });
    });

    // No display, so the dashboard renders "connect_session unknown" rather than hiding the mechanism.
    it('names the mechanism but nobody when a connect session carries no end user', () => {
        expect(resolveActor({ authType: 'connectSession', account } as any)).toEqual({ type: 'connect_session', id: 'unknown' });
    });

    // An auth type nothing maps must say we could not attribute it, never that nobody authenticated.
    it('is unknown for an auth type nothing maps, with no user to name', () => {
        expect(resolveActor({ authType: 'adminKey', account } as any)).toEqual({ type: 'unknown', id: 'unknown', display: 'unknown' });
    });

    it.each(['basic', 'none'] as const)('names the dashboard user behind authType %s', (authType) => {
        expect(resolveActor({ authType, account, user: { id: 7, email: 'dev@example.com' } } as any)).toEqual({
            type: 'user',
            id: '7',
            display: 'dev@example.com'
        });
    });
});

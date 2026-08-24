import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import {
    auditConnectionUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhookUrlsChanged,
    auditFunctionDeployed,
    auditFunctionDeployedCli,
    auditFunctionDeploymentBundle,
    auditFunctionUpgraded,
    auditMemberInviteAccepted,
    auditMemberInvited,
    auditMemberInviteDeclined,
    auditMemberInviteRevoked,
    auditMfaEnabled,
    auditPreBuiltDeployed,
    auditPublicConnectionDeleted,
    auditSyncPaused,
    auditSyncStarted,
    auditSyncTriggered,
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
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return {
        ...actual,
        getInvitation: getInvitationMock,
        getPlanSafe: getPlanSafeMock,
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
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
        vi.restoreAllMocks();
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

    it('webhook settings: records only the URL origin, never the path or secret query params', async () => {
        const req = fakeReq({ body: { primary_url: 'https://hooks.example/primary?token=shh-secret' } });
        const event = await runAudit(auditEnvironmentWebhookUrlsChanged, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            metadata: { primaryUrl: 'https://hooks.example' }
        });
        expect(JSON.stringify(event)).not.toContain('shh-secret');
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
            targets: [{ type: 'member', id: 'dev@example.com', display: 'dev@example.com' }]
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
            targets: [{ type: 'member', id: 'dev@example.com', display: 'dev@example.com' }]
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
            targets: [{ type: 'member', id: 'dev@example.com', display: 'dev@example.com' }]
        });
    });

    it('bulk CLI deploy: one target per flow, the script type carried as display', async () => {
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
                { type: 'function', id: 'flow-a', display: 'sync' },
                { type: 'function', id: 'flow-b', display: 'action' }
            ]
        });
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
                { type: 'function', id: 'github:fetchIssues', display: 'fetchIssues' },
                { type: 'function', id: 'gitlab:fetchIssues', display: 'fetchIssues' }
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
            targets: [{ type: 'function', id: 'my-sync' }],
            metadata: { providerConfigKey: 'algolia', upgradeVersion: '2.0.0' }
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

    it('sync trigger: records the run mode alongside the targets', async () => {
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
            metadata: { providerConfigKey: 'algolia', full: false, deleteRecords: false }
        });
    });

    it('sync trigger: an incremental run never claims to have cleared records', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a'], provider_config_key: 'algolia', opts: { emptyCache: true } } });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', full: false, deleteRecords: false });
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
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', full: false, deleteRecords: false });
    });

    it('sync trigger: takes the integration and connection from the headers when the body omits them', async () => {
        const headers: Record<string, string> = { 'provider-config-key': 'algolia', 'connection-id': 'conn-1', 'user-agent': 'vitest' };
        const req = fakeReq({ body: { syncs: ['sync-a'] }, get: (h: string) => headers[h.toLowerCase()] });
        const event = await runAudit(auditSyncTriggered, req, fakeRes(secretKeyLocals));
        expect(event?.metadata).toEqual({ providerConfigKey: 'algolia', connectionId: 'conn-1', full: false, deleteRecords: false });
    });

    it.each([
        ['incremental sync_mode', { sync_mode: 'incremental' }, { full: false, deleteRecords: false }],
        ['full_refresh sync_mode', { sync_mode: 'full_refresh' }, { full: true, deleteRecords: false }],
        ['full_refresh_and_clear_cache sync_mode', { sync_mode: 'full_refresh_and_clear_cache' }, { full: true, deleteRecords: true }],
        ['deprecated full_resync', { full_resync: true }, { full: true, deleteRecords: false }],
        ['opts.reset with opts.emptyCache', { opts: { reset: true, emptyCache: true } }, { full: true, deleteRecords: true }]
    ])('sync trigger: %s is recorded as the run mode', async (_name, body, expected) => {
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

    it('single-function deployment: the function name is the target, provider + type in metadata', async () => {
        const req = fakeReq({ body: { type: 'function', integration_id: 'algolia', function_name: 'my-func', function_type: 'action', code: '' } });
        const event = await runAudit(auditFunctionDeployed, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'function', id: 'my-func' }],
            metadata: { providerConfigKey: 'algolia', type: 'action' }
        });
    });

    it('pre-built flow deploy: the script name is the target, provider + type in metadata', async () => {
        const req = fakeReq({ body: { providerConfigKey: 'algolia', scriptName: 'my-prebuilt-sync', type: 'sync' } });
        const event = await runAudit(auditPreBuiltDeployed, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'function',
            action: 'deployed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'function', id: 'my-prebuilt-sync' }],
            metadata: { providerConfigKey: 'algolia', type: 'sync' }
        });
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

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags, metrics } from '@nangohq/utils';

import {
    auditEnvironmentCreated,
    auditEnvironmentUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhooksUpdated,
    auditPublicEnvironmentCreated,
    auditPublicEnvironmentUpdated,
    auditPublicWebhookSigningKeyRotated
} from './environment.middleware.js';
import {
    fakeReq,
    fakeRes,
    getEnvironmentByUuidMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit,
    secretKeyLocals
} from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

const publicEnvironmentParams = { environmentUuid: locals.environment.uuid };
const accountKeyLocals = { ...secretKeyLocals, environment: undefined };

describe('environment audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getEnvironmentByUuidMock.mockReset().mockResolvedValue(locals.environment);
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('environment update: an empty name is omitted rather than recorded', async () => {
        const event = await runAudit(auditEnvironmentUpdated, fakeReq({ body: { name: '', hmac_enabled: true } }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' }
        });
        expect(event?.metadata).toEqual({ changedFields: ['name', 'hmac_enabled'] });
    });

    it('environment create: an empty name is omitted rather than recorded', async () => {
        const event = await runAudit(auditEnvironmentCreated, fakeReq({ body: { name: '' } }), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'environment', action: 'created', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
    });

    it('public environment create: identifies the created environment by UUID', async () => {
        const req = fakeReq({ body: { name: 'staging' } });
        const res = fakeRes(locals);
        await new Promise<void>((resolve) => auditPublicEnvironmentCreated(req, res, () => resolve()));
        res.json({ data: { id: 12, uuid: '00000000-0000-4000-8000-000000000012', name: 'staging' } });
        res.emit('finish');
        await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
        expect(recordMock.mock.calls[0]?.[0]).toMatchObject({
            resource: 'environment',
            action: 'created',
            environment: null,
            targets: [{ type: 'environment', id: '00000000-0000-4000-8000-000000000012', display: 'staging' }]
        });
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
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { name: 'staging', changedFields: ['name', 'hmac_key', 'otlp_headers'] }
        });
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-hmac');
        expect(serialized).not.toContain('super-secret-token');
    });

    it('public environment update: resolves the environment from the path and records nested field names', async () => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({ params: publicEnvironmentParams, body: { name: 'staging', webhooks: { on_sync_error: false } } }),
            fakeRes(accountKeyLocals)
        );
        expect(recordMock).toHaveBeenCalledTimes(1);
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: locals.environment.uuid, display: 'dev' },
            actor: { type: 'api_key', id: secretKeyLocals.apiKeyUuid, display: 'ci-key' },
            targets: [{ type: 'environment', id: locals.environment.uuid, display: 'dev' }]
        });
        expect(event?.metadata).toEqual({ name: 'staging', changedFields: ['name', 'webhooks.on_sync_error'] });
        expect(getEnvironmentByUuidMock).toHaveBeenCalledWith(publicEnvironmentParams.environmentUuid, 42);
    });

    it('public environment update: records OTLP header changes without header values', async () => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({ params: publicEnvironmentParams, body: { otlp_headers: [{ name: 'Authorization', value: 'secret-header' }] } }),
            fakeRes(accountKeyLocals)
        );
        expect(event?.metadata).toEqual({ changedFields: ['otlp_headers'] });
        expect(JSON.stringify(event)).not.toContain('secret-header');
    });

    it('public environment update: records webhook URL origins without credentials, paths, or query parameters', async () => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({
                params: publicEnvironmentParams,
                body: {
                    webhooks: {
                        primary_url: 'https://user:password@hooks.example/private?token=secret-url',
                        secondary_url: 'https://secondary.example/private?token=secret-url'
                    }
                }
            }),
            fakeRes(accountKeyLocals)
        );
        expect(event?.metadata).toEqual({
            changedFields: ['webhooks.primary_url', 'webhooks.secondary_url'],
            primaryUrl: 'https://hooks.example',
            secondaryUrl: 'https://secondary.example'
        });
        expect(JSON.stringify(event)).not.toMatch(/password|private|secret-url/);
    });

    it.each([
        ['an empty string', ''],
        ['null', null]
    ])('public environment update: records URLs cleared with %s as null', async (_name, url) => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({ params: publicEnvironmentParams, body: { webhooks: { primary_url: url, secondary_url: url } } }),
            fakeRes(accountKeyLocals)
        );
        expect(event?.metadata).toEqual({
            changedFields: ['webhooks.primary_url', 'webhooks.secondary_url'],
            primaryUrl: null,
            secondaryUrl: null
        });
    });

    it.each([
        { name: 'a missing body', body: undefined, metadata: undefined },
        { name: 'a null body', body: null, metadata: undefined },
        { name: 'an array body', body: [], metadata: undefined },
        { name: 'null webhooks', body: { webhooks: null }, metadata: { changedFields: ['webhooks'] } },
        { name: 'array webhooks', body: { webhooks: [] }, metadata: { changedFields: ['webhooks'] } },
        { name: 'string webhooks', body: { webhooks: 'invalid' }, metadata: { changedFields: ['webhooks'] } }
    ])('public environment update: $name does not cause an enrichment failure', async ({ body, metadata }) => {
        const increment = vi.spyOn(metrics, 'increment');
        const event = await runAudit(auditPublicEnvironmentUpdated, fakeReq({ params: publicEnvironmentParams, body }), fakeRes(accountKeyLocals, 400));
        expect(event).toMatchObject({ resource: 'environment', action: 'updated', accountId: 42, outcome: 'failure' });
        expect(event?.metadata).toEqual(metadata);
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, expect.anything(), expect.anything());
    });

    it('public environment update: omits empty webhook settings from changed fields', async () => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({ params: publicEnvironmentParams, body: { name: 'staging', webhooks: {} } }),
            fakeRes(accountKeyLocals)
        );
        expect(event?.metadata).toEqual({ name: 'staging', changedFields: ['name'] });
    });

    it('public signing key rotation: records the event without the imported key', async () => {
        const key = '8a27fe09-327c-43ec-8f75-b1f212904f45';
        const event = await runAudit(auditPublicWebhookSigningKeyRotated, fakeReq({ body: { webhook_signing_key: key } }), fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_signing_key_rotated',
            outcome: 'success',
            accountId: 42,
            environment: { id: locals.environment.uuid, display: 'dev' },
            actor: { type: 'api_key', id: secretKeyLocals.apiKeyUuid },
            targets: [{ type: 'environment', id: '9', display: 'dev' }]
        });
        expect(event?.metadata).toBeUndefined();
        expect(JSON.stringify(event)).not.toContain(key);
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
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { variableCount: 2, variableNames: ['API_URL', 'TOKEN'] },
            context: { interface: 'api', ip: '203.0.113.7', userAgent: 'vitest' }
        });
        const serialized = JSON.stringify(event);
        expect(serialized).not.toContain('super-secret-value');
        expect(serialized).not.toContain('secret.example');
    });

    it('marks a session that predates the operator id, without inventing one', async () => {
        const req = fakeReq({
            body: { variables: [] },
            session: { impersonatedBy: { accountId: 1, accountName: 'Nango' } }
        });
        const event = await runAudit(auditEnvironmentVariablesChanged, req, fakeRes(locals));
        expect(event?.via).toEqual([{ type: 'impersonation', id: '1', display: 'Nango' }]);
    });

    it('webhook settings: records only the URL origin, never the path or secret query params', async () => {
        const req = fakeReq({ body: { primary_url: 'https://hooks.example/primary?token=shh-secret' } });
        const event = await runAudit(auditEnvironmentWebhooksUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'environment', id: '9', display: 'dev' }],
            metadata: { changedFields: ['webhooks.primary_url'], primaryUrl: 'https://hooks.example' }
        });
        expect(JSON.stringify(event)).not.toContain('shh-secret');
    });

    it('webhook settings: records subscription changes as environment updates', async () => {
        const req = fakeReq({ body: { on_auth_creation: true, on_sync_error: false } });
        const event = await runAudit(auditEnvironmentWebhooksUpdated, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            metadata: { changedFields: ['webhooks.on_auth_creation', 'webhooks.on_sync_error'] }
        });
        expect(event?.metadata ?? {}).not.toHaveProperty('primaryUrl');
        expect(event?.metadata ?? {}).not.toHaveProperty('secondaryUrl');
    });

    it('webhook settings: records cleared URLs as null', async () => {
        const event = await runAudit(auditEnvironmentWebhooksUpdated, fakeReq({ body: { primary_url: '', secondary_url: '' } }), fakeRes(locals));
        expect(event?.metadata).toEqual({
            changedFields: ['webhooks.primary_url', 'webhooks.secondary_url'],
            primaryUrl: null,
            secondaryUrl: null
        });
    });

    it('webhook settings: a missing body records the event without an enrichment failure', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        const event = await runAudit(auditEnvironmentWebhooksUpdated, fakeReq({ body: undefined }), fakeRes(locals, 400));
        expect(event).toMatchObject({ resource: 'environment', action: 'updated', outcome: 'failure', accountId: 42 });
        expect(event?.metadata).toBeUndefined();
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, expect.anything(), expect.anything());
    });

    it.each([
        { status: 403, outcome: 'denied' },
        { status: 500, outcome: 'failure' }
    ])('public environment update: status $status records $outcome with the attempted change', async ({ status, outcome }) => {
        const event = await runAudit(
            auditPublicEnvironmentUpdated,
            fakeReq({ params: publicEnvironmentParams, body: { name: 'staging' } }),
            fakeRes(accountKeyLocals, status)
        );
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'updated',
            outcome,
            accountId: 42,
            environment: { id: locals.environment.uuid, display: 'dev' },
            actor: { type: 'api_key', id: secretKeyLocals.apiKeyUuid },
            targets: [{ type: 'environment', id: locals.environment.uuid, display: 'dev' }],
            metadata: { name: 'staging', changedFields: ['name'] }
        });
    });

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

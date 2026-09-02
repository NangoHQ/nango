import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import {
    auditEnvironmentCreated,
    auditEnvironmentUpdated,
    auditEnvironmentVariablesChanged,
    auditEnvironmentWebhookUrlsChanged,
    auditPublicEnvironmentCreated
} from './environment.middleware.js';
import { fakeReq, fakeRes, installAuditMockDefaults, locals, recordMock, resetAuditMocks, runAudit } from './testing.js';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('environment audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
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
        const event = await runAudit(auditEnvironmentWebhookUrlsChanged, req, fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'environment',
            action: 'webhook_urls_changed',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
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
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
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

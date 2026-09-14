import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags, metrics } from '@nangohq/utils';

import { auditSyncCommand, auditSyncPaused, auditSyncStarted } from './sync.middleware.js';
import {
    fakeReq,
    fakeRes,
    getConnectionByIdMock,
    installAuditMockDefaults,
    locals,
    recordMock,
    resetAuditMocks,
    runAudit,
    secretKeyLocals
} from './testing.js';

import type { RequestHandler } from 'express';

vi.mock('../../audit.js', async (importOriginal) => (await import('./testing.js')).auditModuleMock(importOriginal as never));
vi.mock('@nangohq/shared', async (importOriginal) => (await import('./testing.js')).sharedModuleMock(importOriginal as never));

describe('sync audit middleware (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getConnectionByIdMock.mockReset().mockResolvedValue({ environment_id: 9, provider_config_key: 'github', connection_id: 'conn-abc' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('sync pause: one target per sync, the variant inside the id', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'success',
            accountId: 42,
            scope: 'environment',
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b::v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });

    it.each([
        ['pause', auditSyncPaused],
        ['start', auditSyncStarted]
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

    it.each([
        ['pause', auditSyncPaused],
        ['start', auditSyncStarted]
    ])('sync %s: targets the integration when the caller named no syncs', async (name, handler) => {
        const req = fakeReq({ body: { syncs: [], provider_config_key: 'algolia', connection_id: 'conn-1' } });
        const event = await runAudit(handler as RequestHandler, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: name === 'pause' ? 'paused' : 'started',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'integration', id: 'algolia' }],
            metadata: { providerConfigKey: 'algolia', connectionId: 'conn-1' }
        });
    });

    it('sync pause: targets the integration when the body carries no syncs field at all', async () => {
        const req = fakeReq({ body: { provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event.targets).toEqual([{ type: 'integration', id: 'algolia' }]);
    });

    it('sync pause: keeps the valid syncs beside a malformed one rather than losing every target', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', null, 42, { name: 'sync-b' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event.targets).toEqual([
            { type: 'sync', id: 'sync-a' },
            { type: 'sync', id: 'sync-b' }
        ]);
    });

    it('sync pause: drops a member whose name is not a string instead of concatenating it into a target id', async () => {
        const req = fakeReq({ body: { syncs: [{ name: {}, variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event.targets).toEqual([{ type: 'integration', id: 'algolia' }]);
    });

    it('sync pause: reads a member whose variant is not a string as the base variant', async () => {
        const req = fakeReq({ body: { syncs: [{ name: 'sync-a', variant: [] }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncPaused, req, fakeRes(secretKeyLocals));
        expect(event.targets).toEqual([{ type: 'sync', id: 'sync-a' }]);
    });

    it('sync start: one target per sync, the variant inside the id', async () => {
        const req = fakeReq({ body: { syncs: ['sync-a', { name: 'sync-b', variant: 'v2' }], provider_config_key: 'algolia' } });
        const event = await runAudit(auditSyncStarted, req, fakeRes(secretKeyLocals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'started',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [
                { type: 'sync', id: 'sync-a' },
                { type: 'sync', id: 'sync-b::v2' }
            ],
            metadata: { providerConfigKey: 'algolia' }
        });
    });
});

function syncCommandReq(command: string, extra: Record<string, unknown> = {}) {
    return fakeReq({ body: { command, nango_connection_id: 1, sync_id: 'sync-1', sync_name: 'test-sync', ...extra } });
}

describe('auditSyncCommand middleware behavior (unit)', () => {
    beforeEach(() => {
        installAuditMockDefaults();
        getConnectionByIdMock.mockReset().mockResolvedValue({ environment_id: 9, provider_config_key: 'github', connection_id: 'conn-abc' });
    });

    afterEach(() => {
        resetAuditMocks();
    });

    it('PAUSE maps to a sync paused event targeting the sync', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('PAUSE'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'sync', id: 'test-sync' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc' }
        });
    });

    it('UNPAUSE maps to a sync started event', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('UNPAUSE'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'started',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'sync', id: 'test-sync' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc' }
        });
    });

    it('RUN maps to a sync triggered event with reset: false', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'sync', id: 'test-sync' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc', reset: false, emptyCache: false }
        });
    });

    it('RUN_FULL maps to a sync triggered event with reset and emptyCache', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN_FULL', { delete_records: true }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: 'test-sync' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc', reset: true, emptyCache: true }
        });
    });

    it('CANCEL maps to a sync cancelled event', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('CANCEL'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'cancelled',
            outcome: 'success',
            accountId: 42,
            environment: { id: 'e0000000-0000-4000-8000-000000000009', display: 'dev' },
            targets: [{ type: 'sync', id: 'test-sync' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc' }
        });
    });

    it('RUN with a sync_variant folds it into the target id, the form the public API accepts', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN', { sync_variant: 'my-variant' }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: 'test-sync::my-variant' }],
            metadata: { providerConfigKey: 'github', connectionId: 'conn-abc', reset: false, emptyCache: false }
        });
    });

    // Every per-route test passes while the two surfaces disagree, so only a comparison catches drift.
    it.each([
        { command: 'PAUSE', publicSpec: auditSyncPaused, label: 'paused', body: {}, publicBody: {} },
        { command: 'UNPAUSE', publicSpec: auditSyncStarted, label: 'started', body: {}, publicBody: {} }
    ])('records $label with the same scope, target and metadata as the public route', async ({ command, publicSpec, body, publicBody }) => {
        const privateEvent = await runAudit(auditSyncCommand, syncCommandReq(command, { sync_variant: 'v2', ...body }), fakeRes(locals));

        recordMock.mockReset().mockResolvedValue(undefined);
        const publicReq = fakeReq({
            body: { syncs: [{ name: 'test-sync', variant: 'v2' }], provider_config_key: 'github', connection_id: 'conn-abc', ...publicBody }
        });
        const publicEvent = await runAudit(publicSpec, publicReq, fakeRes(locals));

        expect(privateEvent.scope).toEqual(publicEvent.scope);
        expect(privateEvent.targets).toEqual(publicEvent.targets);
        expect(privateEvent.metadata).toEqual(publicEvent.metadata);
    });

    it('records no integration or connection when the connection belongs to another environment', async () => {
        getConnectionByIdMock.mockResolvedValue({ environment_id: 4321, provider_config_key: 'someone-else', connection_id: 'their-conn' });
        const event = await runAudit(auditSyncCommand, syncCommandReq('PAUSE'), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'sync', action: 'paused', targets: [{ type: 'sync', id: 'test-sync' }] });
        expect(event.metadata).toBeUndefined();
        expect(JSON.stringify(event)).not.toContain('someone-else');
        expect(JSON.stringify(event)).not.toContain('their-conn');
    });

    it('still records the event when the connection lookup fails, and counts the degradation', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        getConnectionByIdMock.mockRejectedValue(new Error('db unavailable'));
        const event = await runAudit(auditSyncCommand, syncCommandReq('PAUSE'), fakeRes(locals));
        expect(event).toMatchObject({ resource: 'sync', action: 'paused', outcome: 'success', targets: [{ type: 'sync', id: 'test-sync' }] });
        expect(event.metadata).toBeUndefined();
        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'metadata', resource: 'sync' });
    });

    it('maps the response status to an outcome (403 → denied)', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('PAUSE'), fakeRes(locals, 403));
        expect(event).toMatchObject({ resource: 'sync', action: 'paused', outcome: 'denied' });
    });

    it('records nothing when the command is absent or unmapped', async () => {
        const req = syncCommandReq('NOT_A_COMMAND');
        const res = fakeRes(locals);

        await new Promise<void>((resolve) => auditSyncCommand(req, res, () => resolve()));
        res.emit('finish');
        // Give the fire-and-forget finish hook a tick, then confirm the unmapped command emitted nothing.
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('records nothing when the audit trail is not enabled', async () => {
        flags.hasAuditTrail = false;
        const req = syncCommandReq('PAUSE');
        const res = fakeRes(locals);

        await new Promise<void>((resolve) => auditSyncCommand(req, res, () => resolve()));
        res.emit('finish');
        await new Promise((resolve) => setImmediate(resolve));
        expect(recordMock).not.toHaveBeenCalled();
    });
});

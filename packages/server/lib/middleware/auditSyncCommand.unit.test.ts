import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { flags } from '@nangohq/utils';

import { auditSyncCommand } from './auditSyncCommand.middleware.js';

import type * as AuditModule from '../audit.js';
import type { RequestHandler } from 'express';

const recordMock = vi.hoisted(() => vi.fn());
vi.mock('../audit.js', async (importOriginal) => ({ ...(await importOriginal<typeof AuditModule>()), audit: { record: recordMock } }));

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

// auditSyncCommand registers its emit on the response 'finish' event and calls next() immediately.
// Invoke it, fire 'finish', and return the recorded event.
async function runAudit(handler: RequestHandler, req: any, res: any) {
    await new Promise<void>((resolve) => handler(req, res, () => resolve()));
    res.emit('finish');
    await vi.waitFor(() => expect(recordMock).toHaveBeenCalled());
    return recordMock.mock.calls[0]?.[0];
}

function syncCommandReq(command: string, extra: Record<string, unknown> = {}) {
    return fakeReq({ body: { command, nango_connection_id: 1, sync_id: 'sync-1', sync_name: 'test-sync', ...extra } });
}

describe('auditSyncCommand middleware behavior (unit)', () => {
    beforeEach(() => {
        recordMock.mockReset().mockResolvedValue({ isErr: () => false });
        // getFlags() returns the stable noop facade in tests; force the audit trail on.
        // No plans in a unit run, so the entitlement path resolves off and the deployment opt-in is what
        // reaches the middleware. Which gate admits a request is covered in utils/auditTrail.unit.test.ts.
        flags.hasAuditTrail = true;
    });

    afterEach(() => {
        flags.hasAuditTrail = false;
    });

    it('PAUSE maps to a sync paused event targeting the sync', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('PAUSE'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'paused',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            actor: { type: 'user', id: '7', display: 'dev@example.com' },
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }]
        });
    });

    it('UNPAUSE maps to a sync started event', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('UNPAUSE'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'started',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }]
        });
    });

    it('RUN maps to a sync triggered event with full: false', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }],
            metadata: { full: false }
        });
    });

    it('RUN_FULL maps to a sync triggered event with full and deleteRecords', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN_FULL', { delete_records: true }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }],
            metadata: { full: true, deleteRecords: true }
        });
    });

    it('CANCEL maps to a sync cancelled event', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('CANCEL'), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'cancelled',
            outcome: 'success',
            accountId: 42,
            environment: { id: 9, display: 'dev' },
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }]
        });
    });

    it('RUN with a sync_variant records the variant in metadata', async () => {
        const event = await runAudit(auditSyncCommand, syncCommandReq('RUN', { sync_variant: 'my-variant' }), fakeRes(locals));
        expect(event).toMatchObject({
            resource: 'sync',
            action: 'triggered',
            outcome: 'success',
            targets: [{ type: 'sync', id: 'sync-1', display: 'test-sync' }],
            metadata: { full: false, variant: 'my-variant' }
        });
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

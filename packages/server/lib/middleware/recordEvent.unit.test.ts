import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Err, metrics, Ok } from '@nangohq/utils';

import { recordEvent } from './audit.middleware.js';

import type { AuditEvent } from '@nangohq/audit';

const recordMock = vi.hoisted(() => vi.fn());
vi.mock('../audit.js', () => ({ audit: { record: recordMock } }));

const event: AuditEvent = {
    occurredAt: '2026-07-31T10:00:00.000Z',
    accountId: 42,
    environment: null,
    actor: { type: 'user', id: '7', display: 'dev@example.com' },
    resource: 'connection',
    action: 'deleted',
    targets: [{ type: 'connection', id: '10' }],
    context: {},
    outcome: 'success'
};

const dropped = (source: string) => [metrics.Types.AUDIT_EMIT_DROPPED, 1, { source }];

describe('recordEvent — every way an event fails to reach the store is counted once', () => {
    beforeEach(() => {
        // The metrics spy persists across tests; without clearing, negative assertions depend on order.
        vi.clearAllMocks();
        recordMock.mockReset().mockResolvedValue(Ok(undefined));
    });

    it('does not count an event the writer accepted', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);

        await recordEvent(() => event, 'auditable');

        expect(recordMock).toHaveBeenCalledWith(event);
        expect(inc).not.toHaveBeenCalledWith(...dropped('auditable'));
    });

    it('counts a writer that returns an error — the write or publish failed, so the event is gone', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        recordMock.mockResolvedValue(Err(new Error('clickhouse down')));

        await recordEvent(() => event, 'auditable');

        expect(inc).toHaveBeenCalledWith(...dropped('auditable'));
    });

    it('counts a writer that throws', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        recordMock.mockRejectedValue(new Error('boom'));

        await recordEvent(() => event, 'auditable');

        expect(inc).toHaveBeenCalledWith(...dropped('auditable'));
    });

    it('counts a builder that throws, and never reaches the writer', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);

        await recordEvent(() => {
            throw new Error('could not build the event');
        }, 'auditable');

        expect(inc).toHaveBeenCalledWith(...dropped('auditable'));
        expect(recordMock).not.toHaveBeenCalled();
    });

    it('reports the calling path as the source', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        recordMock.mockResolvedValue(Err(new Error('clickhouse down')));

        await recordEvent(() => event, 'auth');
        await recordEvent(() => event, 'mfa_verified');
        await recordEvent(() => event, 'sync_command');

        expect(inc).toHaveBeenCalledWith(...dropped('auth'));
        expect(inc).toHaveBeenCalledWith(...dropped('mfa_verified'));
        expect(inc).toHaveBeenCalledWith(...dropped('sync_command'));
    });

    it('never throws, so a failure cannot escape into the response finish handler', async () => {
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        recordMock.mockRejectedValue(new Error('boom'));

        await expect(recordEvent(() => event, 'auditable')).resolves.toBeUndefined();
    });
});

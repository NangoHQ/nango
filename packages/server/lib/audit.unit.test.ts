import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { audit, auditEventDropped, recordAuditEvent } from './audit.js';

import type { AuditEvent } from '@nangohq/audit';

const event = { resource: 'integration', action: 'deleted', actor: { type: 'user', id: '7' } } as unknown as AuditEvent;

describe('recordAuditEvent', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('counts a written event under its resource', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        vi.spyOn(audit, 'record').mockResolvedValue({ isErr: () => false } as never);

        await recordAuditEvent(event);

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_RECORDED, 1, { resource: 'integration' });
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, expect.anything());
    });

    it('counts an unknown actor under its resource', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        vi.spyOn(audit, 'record').mockResolvedValue({ isErr: () => false } as never);

        await recordAuditEvent({ ...event, actor: { type: 'unknown', id: 'unknown' } } as unknown as AuditEvent);

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_ENRICHMENT_FAILED, 1, { field: 'actor', resource: 'integration' });
    });

    it('counts a write failure as a drop, since nothing retries it', async () => {
        const increment = vi.spyOn(metrics, 'increment');
        vi.spyOn(audit, 'record').mockResolvedValue({ isErr: () => true, error: new Error('pubsub down') } as never);

        await recordAuditEvent(event);

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, { resource: 'integration', reason: 'write_failed' });
        expect(increment).not.toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_RECORDED, 1, expect.anything());
    });

    it('tags a drop that happened before the event was built', () => {
        const increment = vi.spyOn(metrics, 'increment');

        auditEventDropped('sync', 'build_failed');

        expect(increment).toHaveBeenCalledWith(metrics.Types.AUDIT_EVENT_DROPPED, 1, { resource: 'sync', reason: 'build_failed' });
    });
});

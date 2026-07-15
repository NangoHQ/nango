import { describe, expect, it } from 'vitest';

import { Ok } from '@nangohq/utils';

import { Audit } from './audit.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';
import type { Result } from '@nangohq/utils';

// In-memory sink so tests can assert on what was recorded.
class RecordingSink implements AuditSink {
    events: AuditEvent[] = [];
    record(event: AuditEvent): Promise<Result<void>> {
        this.events.push(event);
        return Promise.resolve(Ok(undefined));
    }
}

const event: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 1,
    environment: { id: 2, display: 'dev' },
    actor: { type: 'user', id: '5', display: 'a@b.co' },
    resource: 'connection',
    action: 'deleted',
    targets: [{ type: 'connection', id: '10', display: 'conn (github)' }],
    context: { ip: '10.0.0.1' },
    outcome: 'success'
};

const roleEvent: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 1,
    environment: null,
    actor: { type: 'user', id: '5', display: 'admin@b.co' },
    resource: 'member',
    action: 'role_changed',
    targets: [{ type: 'member', id: '9', display: 'u@b.co' }],
    context: {},
    outcome: 'success',
    metadata: { fromRole: 'development_full_access', toRole: 'administrator' }
};

describe('Audit.record', () => {
    it('routes events to its sink', async () => {
        const sink = new RecordingSink();
        await new Audit(sink).record(event);
        expect(sink.events).toEqual([event]);
    });

    it('returns Err instead of throwing when the sink fails', async () => {
        const audit = new Audit({
            record() {
                throw new Error('boom');
            }
        });
        const result = await audit.record(event);
        expect(result.isErr()).toBe(true);
    });

    it('preserves typed metadata on events that define it', async () => {
        const sink = new RecordingSink();
        await new Audit(sink).record(roleEvent);
        expect(sink.events).toEqual([roleEvent]);
    });
});

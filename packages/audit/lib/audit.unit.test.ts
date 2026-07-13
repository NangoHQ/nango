import { describe, expect, it } from 'vitest';

import { Audit } from './audit.js';

import type { AuditEvent } from './event.js';
import type { AuditSink } from './sink.js';

// In-memory sink so tests can assert on what was recorded.
class RecordingSink implements AuditSink {
    events: AuditEvent[] = [];
    record(event: AuditEvent): void {
        this.events.push(event);
    }
}

const event: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 1,
    environmentId: 2,
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
    environmentId: null,
    actor: { type: 'user', id: '5', display: 'admin@b.co' },
    resource: 'member',
    action: 'role_changed',
    targets: [{ type: 'member', id: '9', display: 'u@b.co' }],
    context: {},
    outcome: 'success',
    metadata: { fromRole: 'development_full_access', toRole: 'administrator' }
};

describe('Audit.record', () => {
    it('routes events to its sink', () => {
        const sink = new RecordingSink();
        new Audit(sink).record(event);
        expect(sink.events).toEqual([event]);
    });

    it('never throws when the sink throws', () => {
        const audit = new Audit({
            record() {
                throw new Error('boom');
            }
        });
        expect(() => {
            audit.record(event);
        }).not.toThrow();
    });

    it('preserves typed metadata on events that define it', () => {
        const sink = new RecordingSink();
        new Audit(sink).record(roleEvent);
        expect(sink.events).toEqual([roleEvent]);
    });
});

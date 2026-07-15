import { describe, expect, it, vi } from 'vitest';

import { Err, Ok } from '@nangohq/utils';

import { PubSubAuditSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { Publisher } from '@nangohq/pubsub';

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

describe('PubSubAuditSink.record', () => {
    it('publishes the event as an audit.recorded message', async () => {
        const publish = vi.fn().mockResolvedValue(Ok(undefined));
        const sink = new PubSubAuditSink({ publish } as unknown as Publisher);

        const result = await sink.record(event);

        expect(result.isOk()).toBe(true);
        expect(publish).toHaveBeenCalledWith({ subject: 'audit', type: 'audit.recorded', payload: event });
    });

    it('propagates a publish failure', async () => {
        const publish = vi.fn().mockResolvedValue(Err(new Error('no broker')));
        const sink = new PubSubAuditSink({ publish } as unknown as Publisher);

        const result = await sink.record(event);

        expect(result.isErr()).toBe(true);
    });
});

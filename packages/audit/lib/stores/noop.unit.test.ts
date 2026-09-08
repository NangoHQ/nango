import { describe, expect, it } from 'vitest';

import { NoopAuditStore } from './noop.js';

import type { AuditReader, AuditWriter } from '../store.js';
import type { SerializedAuditEvent } from '@nangohq/types';

const record: SerializedAuditEvent = {
    event: JSON.stringify({
        id: '11111111-1111-1111-1111-111111111111',
        version: '2026-07-16',
        occurredAt: '2026-01-01T00:00:00.000Z',
        accountId: 42,
        environment: { id: 2, display: 'dev' },
        actor: { type: 'user', id: '5', display: 'a@b.co' },
        resource: 'connection',
        action: 'deleted',
        targets: [{ type: 'connection', id: '10' }],
        context: { ip: '1.2.3.4' },
        outcome: 'success'
    })
};

describe('NoopAuditStore', () => {
    it('drops writes and returns empty reads', async () => {
        const store: AuditWriter & AuditReader = new NoopAuditStore();
        expect((await store.record(record)).isOk()).toBe(true);
        expect((await store.list({ accountId: 1, limit: 25 })).unwrap()).toEqual({ events: [], nextCursor: null });
    });
});

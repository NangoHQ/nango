import { describe, expect, it } from 'vitest';

import { Ok } from '@nangohq/utils';

import { Audit, InvalidAuditCursorError } from './audit.js';
import { DropAuditStore } from './store.js';

import type { AuditEvent } from './event.js';
import type { AuditStore, AuditTrailPage, ListAuditTrailEventsParams } from './store.js';
import type { Result } from '@nangohq/utils';

// In-memory store so tests can assert on what was recorded and on how `list` is called.
class RecordingStore implements AuditStore {
    events: AuditEvent[] = [];
    listCalls: ListAuditTrailEventsParams[] = [];

    record(event: AuditEvent): Promise<Result<void>> {
        this.events.push(event);
        return Promise.resolve(Ok(undefined));
    }

    list(params: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>> {
        this.listCalls.push(params);
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
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
    it('routes events to its store', async () => {
        const store = new RecordingStore();
        await new Audit(store).record(event);
        expect(store.events).toEqual([event]);
    });

    it('returns Err instead of throwing when the store fails', async () => {
        const audit = new Audit({
            record() {
                throw new Error('boom');
            },
            list() {
                return Promise.resolve(Ok({ events: [], nextCursor: null }));
            }
        });
        const result = await audit.record(event);
        expect(result.isErr()).toBe(true);
    });

    it('preserves typed metadata on events that define it', async () => {
        const store = new RecordingStore();
        await new Audit(store).record(roleEvent);
        expect(store.events).toEqual([roleEvent]);
    });
});

describe('Audit.listAuditTrailEvents', () => {
    it('returns empty for a DropAuditStore (audit not wired)', async () => {
        const result = await new Audit(new DropAuditStore()).listAuditTrailEvents({ accountId: 1, limit: 25 });
        expect(result.unwrap()).toEqual({ events: [], nextCursor: null });
    });

    it('rejects a non-decodable cursor before hitting the store', async () => {
        const store = new RecordingStore();
        const result = await new Audit(store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor: 'not-a-valid-cursor' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InvalidAuditCursorError);
        }
        expect(store.listCalls).toHaveLength(0);
    });

    it('rejects a JSON-shaped cursor with invalid timestamp/id values (would 500 at the CH bind otherwise)', async () => {
        const store = new RecordingStore();
        const cursor = Buffer.from(JSON.stringify({ occurredAt: 'garbage', id: 'not-a-uuid' })).toString('base64');
        const result = await new Audit(store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InvalidAuditCursorError);
        }
        expect(store.listCalls).toHaveLength(0);
    });

    it('round-trips a valid opaque cursor to the store as (occurredAt, id)', async () => {
        const store = new RecordingStore();
        const before = { occurredAt: '2026-01-01 00:00:00.000', id: '11111111-1111-1111-1111-111111111111' };
        const cursor = Buffer.from(JSON.stringify(before)).toString('base64');
        await new Audit(store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor });
        expect(store.listCalls[0]?.before).toEqual(before);
    });
});

import { describe, expect, it } from 'vitest';

import { Ok } from '@nangohq/utils';

import { AuditClient, InvalidAuditCursorError } from './client.js';
import { NoopAuditStore } from './stores/noop.js';

import type { AuditReader, AuditTrailPage, AuditWriter, ListAuditTrailEventsParams } from './store.js';
import type { AuditEvent, SerializedAuditEvent, StoredAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

class RecordingStore implements AuditWriter, AuditReader {
    records: SerializedAuditEvent[] = [];
    listCalls: ListAuditTrailEventsParams[] = [];

    record(record: SerializedAuditEvent): Promise<Result<void>> {
        this.records.push(record);
        return Promise.resolve(Ok(undefined));
    }

    list(params: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>> {
        this.listCalls.push(params);
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
    }

    stored(index = 0): StoredAuditEvent {
        return JSON.parse(this.records[index]!.event) as StoredAuditEvent;
    }
}

const event: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 1,
    scope: 'environment',
    environment: { id: 'e0000000-0000-4000-8000-000000000001', display: 'dev' },
    actor: { type: 'user', id: '5', display: 'a@b.co' },
    resource: 'connection',
    action: 'deleted',
    targets: [{ type: 'connection', id: '10', display: 'conn (github)' }],
    context: { interface: 'api', ip: '10.0.0.1' },
    outcome: 'success'
};

const roleEvent: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 1,
    scope: 'account',
    environment: null,
    actor: { type: 'user', id: '5', display: 'admin@b.co' },
    resource: 'member',
    action: 'role_changed',
    targets: [{ type: 'member', id: '9', display: 'u@b.co' }],
    context: {},
    outcome: 'success',
    metadata: { fromRole: 'development_full_access', toRole: 'administrator' }
};

describe('AuditClient.record', () => {
    it('hands the writer the serialized event, stamped with an id and version', async () => {
        const store = new RecordingStore();
        await new AuditClient(store, store).record(event);

        expect(store.records).toHaveLength(1);
        const stored = store.stored();
        expect(stored.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(stored.version).toBe('2026-07-16');
        expect(stored).toMatchObject(event);
    });

    it('stamps the id before the writer sees it, so a redelivered record keeps the same id', async () => {
        const store = new RecordingStore();
        const audit = new AuditClient(store, store);
        await audit.record(event);

        await store.record(store.records[0]!);

        expect(store.stored(0).id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(store.stored(1).id).toBe(store.stored(0).id);
    });

    it('gives each emitted event its own id', async () => {
        const store = new RecordingStore();
        const audit = new AuditClient(store, store);
        await audit.record(event);
        await audit.record(event);

        expect(store.stored(1).id).not.toBe(store.stored(0).id);
    });

    it('returns Err instead of throwing when the writer fails', async () => {
        const audit = new AuditClient(
            {
                record() {
                    throw new Error('boom');
                }
            },
            new NoopAuditStore()
        );
        const result = await audit.record(event);
        expect(result.isErr()).toBe(true);
    });

    it('preserves typed metadata through serialization', async () => {
        const store = new RecordingStore();
        await new AuditClient(store, store).record(roleEvent);
        expect(store.stored()).toMatchObject(roleEvent);
    });
});

describe('AuditClient.listAuditTrailEvents', () => {
    it('returns empty for a NoopAuditStore (audit not wired)', async () => {
        const drop = new NoopAuditStore();
        const result = await new AuditClient(drop, drop).listAuditTrailEvents({ accountId: 1, limit: 25 });
        expect(result.unwrap()).toEqual({ events: [], nextCursor: null });
    });

    it('rejects a non-decodable cursor before hitting the reader', async () => {
        const store = new RecordingStore();
        const result = await new AuditClient(store, store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor: 'not-a-valid-cursor' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InvalidAuditCursorError);
        }
        expect(store.listCalls).toHaveLength(0);
    });

    it('rejects a JSON-shaped cursor with invalid timestamp/id values (would 500 at the CH bind otherwise)', async () => {
        const store = new RecordingStore();
        const cursor = Buffer.from(JSON.stringify({ occurredAt: 'garbage', id: 'not-a-uuid' })).toString('base64');
        const result = await new AuditClient(store, store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error).toBeInstanceOf(InvalidAuditCursorError);
        }
        expect(store.listCalls).toHaveLength(0);
    });

    it('round-trips a valid opaque cursor to the reader as (occurredAt, id)', async () => {
        const store = new RecordingStore();
        const before = { occurredAt: '2026-01-01 00:00:00.000', id: '11111111-1111-1111-1111-111111111111' };
        const cursor = Buffer.from(JSON.stringify(before)).toString('base64');
        await new AuditClient(store, store).listAuditTrailEvents({ accountId: 1, limit: 25, cursor });
        expect(store.listCalls[0]?.before).toEqual(before);
    });
});

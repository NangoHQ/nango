import { ClickHouseError } from '@clickhouse/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { ClickhouseAuditStore, DropAuditStore } from './store.js';

import type { AuditReader, AuditWriter } from './store.js';
import type { ClickHouseClient } from '@clickhouse/client';
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

describe('ClickhouseAuditStore.record', () => {
    afterEach(() => vi.restoreAllMocks());

    it('inserts the record verbatim with the retention tier', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockResolvedValue({});
        const store = new ClickhouseAuditStore({ insert } as unknown as ClickHouseClient, 90);

        const result = await store.record(record);

        expect(result.isOk()).toBe(true);
        expect(insert).toHaveBeenCalledOnce();
        const arg = insert.mock.calls[0]![0] as { table: string; format: string; values: { event: string; retention_days: number }[] };
        expect(arg.table).toBe('audit_trail_events');
        expect(arg.format).toBe('JSONEachRow');
        expect(arg.values).toEqual([{ event: record.event, retention_days: 90 }]);

        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'true' });
    });

    it('returns Err and reports a failure metric when the insert fails', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockRejectedValue(new Error('clickhouse unavailable'));
        const store = new ClickhouseAuditStore({ insert } as unknown as ClickHouseClient, 90);

        const result = await store.record(record);

        expect(result.isErr()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false', reason: 'no_response' });
    });

    it('returns Err with a failure metric instead of throwing on a malformed record', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const store = new ClickhouseAuditStore({ insert: vi.fn() } as unknown as ClickHouseClient, 90);

        const result = await store.record(undefined as unknown as SerializedAuditEvent);

        expect(result.isErr()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false', reason: 'no_response' });
    });
});

describe('DropAuditStore', () => {
    it('drops writes and returns empty reads', async () => {
        const store: AuditWriter & AuditReader = new DropAuditStore();
        expect((await store.record(record)).isOk()).toBe(true);
        expect((await store.list({ accountId: 1, limit: 25 })).unwrap()).toEqual({ events: [], nextCursor: null });
    });
});

describe('ClickhouseAuditStore.recordMany', () => {
    afterEach(() => vi.restoreAllMocks());

    it('writes the whole batch in one insert, carrying the dedup token', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockResolvedValue({});
        const store = new ClickhouseAuditStore({ insert } as unknown as ClickHouseClient, 90);

        const result = await store.recordMany([record, { event: '{"id":"second"}' }], { dedupToken: 'token-1' });

        expect(result.isOk()).toBe(true);
        expect(insert).toHaveBeenCalledOnce();
        const arg = insert.mock.calls[0]![0] as {
            values: { event: string; retention_days: number }[];
            clickhouse_settings: { insert_deduplication_token?: string };
        };
        expect(arg.values).toEqual([
            { event: record.event, retention_days: 90 },
            { event: '{"id":"second"}', retention_days: 90 }
        ]);
        expect(arg.clickhouse_settings.insert_deduplication_token).toBe('token-1');
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 2, { success: 'true' });
    });

    it('counts every record in the batch as failed when the insert fails', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockRejectedValue(new Error('clickhouse unavailable'));
        const store = new ClickhouseAuditStore({ insert } as unknown as ClickHouseClient, 90);

        expect((await store.recordMany([record, record, record], { dedupToken: 't' })).isErr()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 3, { success: 'false', reason: 'no_response' });
    });

    it('does not insert an empty batch', async () => {
        const insert = vi.fn();
        const store = new ClickhouseAuditStore({ insert } as unknown as ClickHouseClient, 90);

        expect((await store.recordMany([], { dedupToken: 't' })).isOk()).toBe(true);
        expect(insert).not.toHaveBeenCalled();
    });
});

describe('ClickhouseAuditStore ingest failures', () => {
    afterEach(() => vi.restoreAllMocks());

    it('separates a server error, where nothing was written, from no response, where it may have been', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const served = new ClickhouseAuditStore(
            { insert: vi.fn().mockRejectedValue(new ClickHouseError({ message: 'constraint violated', code: '469' })) } as unknown as ClickHouseClient,
            90
        );
        const silent = new ClickhouseAuditStore({ insert: vi.fn().mockRejectedValue(new Error('socket hang up')) } as unknown as ClickHouseClient, 90);

        await served.recordMany([record], { dedupToken: 't' });
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false', reason: 'server_error' });

        await silent.recordMany([record], { dedupToken: 't' });
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false', reason: 'no_response' });
    });

    it('returns an error with the quoted row already stripped, so no caller can log it', async () => {
        vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const raw =
            'Code: 469. DB::Exception: Constraint `account_id_valid` is violated at row 1. ' +
            'Column values: event = \'{"actor":{"display":"leak@customer.example"}}\'';
        const store = new ClickhouseAuditStore(
            { insert: vi.fn().mockRejectedValue(new ClickHouseError({ message: raw, code: '469' })) } as unknown as ClickHouseClient,
            90
        );

        const result = await store.recordMany([record], { dedupToken: 't' });
        expect(result.isErr()).toBe(true);
        if (result.isErr()) {
            expect(result.error.message).not.toContain('leak@customer.example');
            expect(result.error.message).toContain('account_id_valid');
        }
    });
});

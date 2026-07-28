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
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false' });
    });
});

describe('DropAuditStore', () => {
    it('drops writes and returns empty reads', async () => {
        const store: AuditWriter & AuditReader = new DropAuditStore();
        expect((await store.record(record)).isOk()).toBe(true);
        expect((await store.list({ accountId: 1, limit: 25 })).unwrap()).toEqual({ events: [], nextCursor: null });
    });
});

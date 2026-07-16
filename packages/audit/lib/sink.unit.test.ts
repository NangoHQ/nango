import { afterEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { auditSink, ClickhouseAuditSink, DropSink } from './sink.js';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';

const event: AuditEvent = {
    occurredAt: '2026-01-01T00:00:00.000Z',
    accountId: 42,
    environment: { id: 2, display: 'dev' },
    actor: { type: 'user', id: '5', display: 'a@b.co' },
    resource: 'connection',
    action: 'deleted',
    targets: [{ type: 'connection', id: '10' }],
    context: { ip: '1.2.3.4' },
    outcome: 'success'
};

describe('auditSink', () => {
    it('returns a DropSink when no client is provided', () => {
        expect(auditSink(null)).toBeInstanceOf(DropSink);
    });

    it('returns a ClickhouseAuditSink when a client is provided', () => {
        expect(auditSink({ insert: () => undefined } as unknown as ClickHouseClient)).toBeInstanceOf(ClickhouseAuditSink);
    });
});

describe('ClickhouseAuditSink.record', () => {
    afterEach(() => vi.restoreAllMocks());

    it('inserts the event as a blob with a stamped id + version and the retention tier', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockResolvedValue({});
        const sink = new ClickhouseAuditSink({ insert } as unknown as ClickHouseClient, 90);

        const result = await sink.record(event);

        expect(result.isOk()).toBe(true);
        expect(insert).toHaveBeenCalledOnce();
        const arg = insert.mock.calls[0]![0] as { table: string; format: string; values: { event: string; retention_days: number }[] };
        expect(arg.table).toBe('audit_trail_events');
        expect(arg.format).toBe('JSONEachRow');
        expect(arg.values).toHaveLength(1);
        expect(arg.values[0]!.retention_days).toBe(90);

        const stored = JSON.parse(arg.values[0]!.event) as Record<string, unknown>;
        expect(stored['version']).toBe(1);
        expect(stored['id']).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(stored['accountId']).toBe(42);
        expect(stored['resource']).toBe('connection');
        expect(stored['occurredAt']).toBe(event.occurredAt);

        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'true' });
    });

    it('returns Err and reports a failure metric when the insert fails', async () => {
        const inc = vi.spyOn(metrics, 'increment').mockImplementation(() => undefined);
        const insert = vi.fn().mockRejectedValue(new Error('clickhouse unavailable'));
        const sink = new ClickhouseAuditSink({ insert } as unknown as ClickHouseClient, 90);

        const result = await sink.record(event);

        expect(result.isErr()).toBe(true);
        expect(inc).toHaveBeenCalledWith(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false' });
    });
});

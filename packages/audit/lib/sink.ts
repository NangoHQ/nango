import { randomUUID } from 'node:crypto';

import { Err, metrics, Ok } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Result } from '@nangohq/utils';

export interface AuditSink {
    record(event: AuditEvent): Promise<Result<void>>;
}

export class DropSink implements AuditSink {
    record(): Promise<Result<void>> {
        // no store wired — drops every event
        return Promise.resolve(Ok(undefined));
    }
}

export class ClickhouseAuditSink implements AuditSink {
    constructor(
        private readonly client: ClickHouseClient,
        private readonly retentionDays: number
    ) {}

    async record(event: AuditEvent): Promise<Result<void>> {
        // id (the ReplacingMergeTree dedup key) and version aren't in the emitted event — stamp them here.
        const stored = { ...event, id: randomUUID(), version: '1.0' };
        try {
            await this.client.insert({
                table: 'audit_trail_events',
                values: [{ event: JSON.stringify(stored), retention_days: this.retentionDays }],
                format: 'JSONEachRow'
            });
            metrics.increment(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'true' });
            return Ok(undefined);
        } catch (err) {
            metrics.increment(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, 1, { success: 'false' });
            return Err(err);
        }
    }
}

// Placeholder retention until per-plan retention is wired (fixed tier bounds partitions).
const AUDIT_RETENTION_DAYS = 90;

// A ClickHouse sink when a client is provided, otherwise a DropSink. The caller builds the client
// (see auditClickhouseClient) so the package never reads env vars itself.
export function auditSink(client: ClickHouseClient | null): AuditSink {
    if (!client) {
        return new DropSink();
    }
    return new ClickhouseAuditSink(client, AUDIT_RETENTION_DAYS);
}

import { randomUUID } from 'node:crypto';

import { Err, metrics, Ok } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Result } from '@nangohq/utils';

// Schema version (date it shipped, not a timestamp); bump to a new date only on a breaking change.
const AUDIT_EVENT_VERSION = '2026-07-16';
const AUDIT_RETENTION_DAYS = 90;

export interface AuditSink {
    record(event: AuditEvent): Promise<Result<void>>;
}

export class DropSink implements AuditSink {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }
}

export class ClickhouseAuditSink implements AuditSink {
    constructor(
        private readonly client: ClickHouseClient,
        private readonly retentionDays = AUDIT_RETENTION_DAYS
    ) {}

    async record(event: AuditEvent): Promise<Result<void>> {
        // id and version are stamped at write; they aren't part of the emitted event.
        const stored = { ...event, id: randomUUID(), version: AUDIT_EVENT_VERSION };
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

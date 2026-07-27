import { randomUUID } from 'node:crypto';

import { Err, getLogger, metrics, Ok, stringifyError } from '@nangohq/utils';

import type { AuditEvent } from './event.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { ApiAuditTrailEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('audit');

// Schema version (date it shipped, not a timestamp); bump to a new date only on a breaking change.
const AUDIT_EVENT_VERSION = '2026-07-16';
const AUDIT_RETENTION_DAYS = 90;
const READ_QUERY_MAX_EXECUTION_SECONDS = 30;

export interface AuditTrailCursor {
    occurredAt: string;
    id: string;
}

export interface ListAuditTrailEventsParams {
    accountId: number;
    limit: number;
    before?: AuditTrailCursor | undefined;
    from?: string | undefined;
    to?: string | undefined;
}

export interface AuditTrailPage {
    events: ApiAuditTrailEvent[];
    nextCursor: AuditTrailCursor | null;
}

// A backend audit events are read from and written to. One implementation per backend, each fully
// implementing both sides.
export interface AuditStore {
    record(event: AuditEvent): Promise<Result<void>>;
    list(params: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>>;
}

// Used when audit isn't wired to a backend: writes are dropped, reads are empty.
export class DropAuditStore implements AuditStore {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    list(): Promise<Result<AuditTrailPage>> {
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
    }
}

export class ClickhouseAuditStore implements AuditStore {
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

    async list({ accountId, limit, before, from, to }: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>> {
        const params: Record<string, unknown> = { account_id: accountId, limit: limit + 1 };
        const conditions = ['account_id = {account_id:Int64}'];
        if (from) {
            conditions.push('occurred_at >= parseDateTime64BestEffortOrNull({from:String}, 3)');
            params['from'] = from;
        }
        if (to) {
            conditions.push('occurred_at <= parseDateTime64BestEffortOrNull({to:String}, 3)');
            params['to'] = to;
        }
        if (before) {
            conditions.push('(occurred_at, id) < ({before_ts:DateTime64(3)}, {before_id:UUID})');
            params['before_ts'] = before.occurredAt;
            params['before_id'] = before.id;
        }

        // Cursor columns aliased so `occurred_at`/`id` in WHERE/ORDER BY still resolve to the real columns.
        const sql = `
            SELECT event, toString(id) AS cursor_id, toString(occurred_at) AS cursor_occurred_at
            FROM audit_trail_events
            WHERE ${conditions.join(' AND ')}
            ORDER BY occurred_at DESC, id DESC
            LIMIT {limit:UInt32}
        `;

        try {
            const res = await this.client.query({
                query: sql,
                format: 'JSONEachRow',
                query_params: params,
                clickhouse_settings: { max_execution_time: READ_QUERY_MAX_EXECUTION_SECONDS }
            });
            const rows = await res.json<{ event: string; cursor_id: string; cursor_occurred_at: string }>();

            // Fetched limit+1: the extra row means there's another page — drop it and expose its cursor.
            const hasMore = rows.length > limit;
            const page = hasMore ? rows.slice(0, limit) : rows;
            const last = page.at(-1);
            const nextCursor = hasMore && last ? { occurredAt: last.cursor_occurred_at, id: last.cursor_id } : null;

            return Ok({ events: page.map((r) => JSON.parse(r.event) as ApiAuditTrailEvent), nextCursor });
        } catch (err) {
            logger.error(`Failed to list audit trail events: ${stringifyError(err)}`);
            return Err('failed_to_list_audit_trail_events');
        }
    }
}

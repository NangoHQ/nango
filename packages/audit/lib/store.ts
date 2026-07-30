import { ClickHouseError } from '@clickhouse/client';

import { Err, getLogger, metrics, Ok, stringifyError } from '@nangohq/utils';

import { sanitizeClickhouseError } from './error.js';

import type { ClickHouseClient } from '@clickhouse/client';
import type { ApiAuditTrailEvent, SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('audit');

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

export interface AuditWriter {
    record(record: SerializedAuditEvent): Promise<Result<void>>;
}

export interface AuditBatchWriter {
    /** `dedupToken` must be stable across retries of a batch, so a re-sent insert is discarded server-side. */
    recordMany(records: SerializedAuditEvent[], opts: { dedupToken: string }): Promise<Result<void>>;
}

export interface AuditReader {
    list(params: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>>;
}

export class DropAuditStore implements AuditWriter, AuditReader {
    record(): Promise<Result<void>> {
        return Promise.resolve(Ok(undefined));
    }

    list(): Promise<Result<AuditTrailPage>> {
        return Promise.resolve(Ok({ events: [], nextCursor: null }));
    }
}

export class ClickhouseAuditStore implements AuditWriter, AuditBatchWriter, AuditReader {
    constructor(
        private readonly client: ClickHouseClient,
        private readonly retentionDays = AUDIT_RETENTION_DAYS
    ) {}

    // Never throws, so every call emits exactly one ingest-result metric — callers rely on that to
    // reconcile events published against events stored.
    async record(record: SerializedAuditEvent): Promise<Result<void>> {
        return this.insert([record], {});
    }

    async recordMany(records: SerializedAuditEvent[], { dedupToken }: { dedupToken: string }): Promise<Result<void>> {
        if (records.length === 0) {
            return Ok(undefined);
        }
        return this.insert(records, { insert_deduplication_token: dedupToken });
    }

    private async insert(records: SerializedAuditEvent[], settings: { insert_deduplication_token?: string }): Promise<Result<void>> {
        try {
            await this.client.insert({
                table: 'audit_trail_events',
                values: records.map((r) => ({ event: r.event, retention_days: this.retentionDays })),
                format: 'JSONEachRow',
                clickhouse_settings: settings
            });
            metrics.increment(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, records.length, { success: 'true' });
            return Ok(undefined);
        } catch (err) {
            // A block insert is atomic, so a server error means nothing was written. No response means the
            // opposite: the rows may be stored and a retry can duplicate them. The specific code is logged
            // rather than tagged, to keep this dimension bounded.
            const reason = err instanceof ClickHouseError ? 'server_error' : 'no_response';
            metrics.increment(metrics.Types.AUDIT_CLICKHOUSE_INGEST_RESULT, records.length, { success: 'false', reason });
            // Sanitised here so no caller can log the row ClickHouse quotes back.
            return Err(new Error(sanitizeClickhouseError(err)));
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

        // No FINAL and no `LIMIT 1 BY id`: both dedup server-side but defeat the short-circuit ORDER BY gets
        // from the primary key prefix. Unbounded on a 5M-row account, rows read: 99K as written, 1.1M with
        // LIMIT 1 BY, 5M with FINAL. Copies are dropped from the result set instead.
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

            // Copies share (account_id, occurred_at, id), so they are adjacent in this ordering. `hasMore`
            // stays keyed off the raw count: a page thinned by more than the spare row is short, not final.
            const deduped = rows.filter((row, i) => i === 0 || row.cursor_id !== rows[i - 1]!.cursor_id);

            // Fetched limit+1: the extra row means there's another page — drop it and expose its cursor.
            const hasMore = rows.length > limit;
            const page = deduped.slice(0, limit);
            const last = page.at(-1);
            const nextCursor = hasMore && last ? { occurredAt: last.cursor_occurred_at, id: last.cursor_id } : null;

            return Ok({ events: page.map((r) => JSON.parse(r.event) as ApiAuditTrailEvent), nextCursor });
        } catch (err) {
            logger.error(`Failed to list audit trail events: ${stringifyError(err)}`);
            return Err('failed_to_list_audit_trail_events');
        }
    }
}

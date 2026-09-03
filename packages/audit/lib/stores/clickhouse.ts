import { ClickHouseError } from '@clickhouse/client';

import { Err, getLogger, metrics, Ok, stringifyError } from '@nangohq/utils';

import { sanitizeClickhouseError } from '../error.js';

import type { AuditBatchWriter, AuditReader, AuditTrailFilter, AuditTrailPage, AuditWriter, ListAuditTrailEventsParams } from '../store.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { ApiAuditTrailEvent, SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';

const logger = getLogger('audit');

const AUDIT_RETENTION_DAYS = 365;
const READ_QUERY_MAX_EXECUTION_SECONDS = 30;
// Shorter than the list's: the count is optional to the response, so a heavy one gives up rather than holding the read open.
const COUNT_QUERY_MAX_EXECUTION_SECONDS = 5;

// One source of the filter, so the count and the list can never describe different sets.
function buildFilter({ accountId, from, to, resources, actions }: AuditTrailFilter): { conditions: string[]; params: Record<string, unknown> } {
    const params: Record<string, unknown> = { account_id: accountId };
    const conditions = ['account_id = {account_id:Int64}'];
    if (resources?.length) {
        if (actions?.length) {
            // Every requested pair, matched against the materialized concatenation. Two separate
            // conditions would prune per column and let a granule through on a pair it doesn't hold.
            conditions.push('resource_action IN {resource_actions:Array(String)}');
            params['resource_actions'] = resources.flatMap((resource) => actions.map((action) => `${resource}.${action}`));
        } else {
            conditions.push('resource IN {resources:Array(String)}');
            params['resources'] = resources;
        }
    }
    if (from) {
        conditions.push('occurred_at >= parseDateTime64BestEffortOrNull({from:String}, 3)');
        params['from'] = from;
    }
    if (to) {
        conditions.push('occurred_at <= parseDateTime64BestEffortOrNull({to:String}, 3)');
        params['to'] = to;
    }
    return { conditions, params };
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

    // Best effort at one row per event, not a guarantee: the pipeline is at-least-once by design, so a copy can appear, and ReplacingMergeTree only
    // collapses it on merge. Until then the copies might sit in separate parts, and reconciling them server-side with FINAL or LIMIT 1 BY id reads far
    // more rows than the query below can afford, so this read reconciles them instead —
    // - in a page: copies share the ORDER BY key, so they arrive adjacent in the merged stream and the neighbour filter below cuts them
    // - across pages: the cursor comparison is strict, so a copy of the boundary row is never fetched again
    // Both key on the event id, so they only catch a redelivery of the same event; a re-emit carries a fresh id and reads as two. A thinned page is the
    // only side effect, which is why `hasMore` keys off the raw count.
    async list({ accountId, limit, before, from, to, resources, actions }: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>> {
        const { conditions, params } = buildFilter({ accountId, from, to, resources, actions });
        params['limit'] = limit + 1;
        if (before) {
            conditions.push('(occurred_at, id) < ({before_ts:DateTime64(3)}, {before_id:UUID})');
            params['before_ts'] = before.occurredAt;
            params['before_id'] = before.id;
        }

        // No FINAL and no `LIMIT 1 BY id`: both dedup server-side but defeat the short-circuit ORDER BY gets from the primary key prefix. Rows read on
        // a 5M-row account: 99K as written, 1.1M with LIMIT 1 BY, 5M with FINAL.
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

    async count(filter: AuditTrailFilter): Promise<Result<number>> {
        const { conditions, params } = buildFilter(filter);

        // Not `count()`: this is a ReplacingMergeTree, so a redelivery sits as a second row until a merge
        // collapses it. `FINAL` is exact too, but gives up the ORDER BY short-circuit the list read needs.
        const sql = `
            SELECT uniqExact(id) AS total
            FROM audit_trail_events
            WHERE ${conditions.join(' AND ')}
        `;

        try {
            const res = await this.client.query({
                query: sql,
                format: 'JSONEachRow',
                query_params: params,
                clickhouse_settings: { max_execution_time: COUNT_QUERY_MAX_EXECUTION_SECONDS }
            });
            const [row] = await res.json<{ total: string }>();
            // A bare aggregate always returns one row, and UInt64 arrives as a string. Anything else is a
            // broken response, and reporting it as 0 would claim nothing matched.
            const total = Number(row?.total);

            return Number.isFinite(total) ? Ok(total) : Err('failed_to_count_audit_trail_events');
        } catch (err) {
            // Warning, not error: the caller is expected to carry on without the number.
            logger.warning(`Failed to count audit trail events for account ${filter.accountId}: ${stringifyError(err)}`);
            return Err('failed_to_count_audit_trail_events');
        }
    }
}

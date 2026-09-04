import tracer from 'dd-trace';

import { Err, getLogger, Ok, stringifyError } from '@nangohq/utils';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from '../postgres/schema.js';

import type { DBAuditTrailEvent } from '../postgres/schema.js';
import type { AuditReader, AuditTrailFilter, AuditTrailPage, AuditWriter, ListAuditTrailEventsParams } from '../store.js';
import type { ApiAuditTrailEvent, AuditExportMaxRows, AuditTrailTotal, SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = getLogger('audit');

const COUNT_SCAN_LIMIT: AuditExportMaxRows = 50_000;

/** Direct-write store for self-hosted and BYOC, which do not use pub/sub. */
export class PostgresAuditStore implements AuditWriter, AuditReader {
    constructor(
        private readonly knex: Knex,
        private readonly schema: string = AUDIT_SCHEMA,
        private readonly countScanLimit: number = COUNT_SCAN_LIMIT
    ) {}

    /**
     * ON CONFLICT DO NOTHING discards a redelivery and never touches a stored event, so reads need no dedup
     * pass — ClickHouse collapses duplicates lazily instead.
     * `occurred_at` is not a generated column because Postgres refuses one as a partition key.
     */
    async record(record: SerializedAuditEvent): Promise<Result<void>> {
        return await tracer.trace('nango.audit.postgres.record', async (span) => {
            try {
                const { event } = record;
                await this.knex.raw(
                    `INSERT INTO ??.?? (event, occurred_at)
                     SELECT blob, (blob ->> 'occurredAt')::timestamptz FROM (SELECT ?::json AS blob) s
                     ON CONFLICT DO NOTHING`,
                    [this.schema, AUDIT_EVENTS_TABLE, event]
                );
                return Ok(undefined);
            } catch (err) {
                // only the code is returned to keep the event out of the logs.
                const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'unknown';
                span?.addTags({ error: code });
                return Err(new Error(`failed_to_record_audit_event: ${code}`));
            } finally {
                span?.finish();
            }
        });
    }

    async count(filter: AuditTrailFilter): Promise<Result<AuditTrailTotal>> {
        const capped = applyFilter(this.knex.withSchema(this.schema).from<DBAuditTrailEvent>(AUDIT_EVENTS_TABLE).select(this.knex.raw('1')), filter).limit(
            this.countScanLimit + 1
        );

        return await tracer.trace('nango.audit.postgres.count', async (span) => {
            try {
                const [row] = await this.knex.from(capped.as('capped')).count<{ count: string }[]>('* as count');
                const scanned = Number(row?.count);
                if (!Number.isFinite(scanned)) {
                    return Err('failed_to_count_audit_trail_events');
                }

                return scanned > this.countScanLimit
                    ? Ok({ value: this.countScanLimit, relation: 'gte' as const })
                    : Ok({ value: scanned, relation: 'eq' as const });
            } catch (err) {
                span?.addTags({ error: stringifyError(err) });
                logger.warning(`Failed to count audit trail events for account ${filter.accountId}: ${stringifyError(err)}`);
                return Err('failed_to_count_audit_trail_events');
            } finally {
                span?.finish();
            }
        });
    }

    async list({ accountId, limit, before, from, to, resources, actions }: ListAuditTrailEventsParams): Promise<Result<AuditTrailPage>> {
        let query = this.knex
            .withSchema(this.schema)
            .from<DBAuditTrailEvent>(AUDIT_EVENTS_TABLE)
            .select(
                this.knex.raw('event::text AS event'),
                this.knex.raw('id::text AS cursor_id'),
                this.knex.raw(`to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_occurred_at`)
            )
            .orderBy([
                { column: 'occurred_at', order: 'desc' },
                { column: 'id', order: 'desc' }
            ])
            .limit(limit + 1);

        query = applyFilter(query, { accountId, from, to, resources, actions });
        if (before) {
            query = query.whereRaw(`(occurred_at, id) < ((?::timestamp AT TIME ZONE 'UTC'), ?::uuid)`, [before.occurredAt, before.id]);
        }

        return await tracer.trace('nango.audit.postgres.list', async (span) => {
            try {
                const rows: { event: string; cursor_id: string; cursor_occurred_at: string }[] = await query;

                const hasMore = rows.length > limit;
                const page = rows.slice(0, limit);
                const last = page.at(-1);
                return Ok({
                    events: page.map((r) => JSON.parse(r.event) as ApiAuditTrailEvent),
                    nextCursor: hasMore && last ? { occurredAt: last.cursor_occurred_at, id: last.cursor_id } : null
                });
            } catch (err) {
                span?.addTags({ error: stringifyError(err) });
                logger.error(`Failed to list audit trail events: ${stringifyError(err)}`);
                return Err(new Error('failed_to_list_audit_trail_events', { cause: err }));
            } finally {
                span?.finish();
            }
        });
    }
}

function applyFilter(query: Knex.QueryBuilder, { accountId, from, to, resources, actions }: AuditTrailFilter): Knex.QueryBuilder {
    query = query.where({ account_id: accountId });
    if (resources?.length) {
        query = query.whereIn('resource', resources);
        if (actions?.length) {
            query = query.whereIn('action', actions);
        }
    }
    if (from) {
        query = query.where('occurred_at', '>=', from);
    }
    if (to) {
        query = query.where('occurred_at', '<=', to);
    }
    return query;
}

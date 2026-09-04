import tracer from 'dd-trace';

import { Err, getLogger, Ok, stringifyError } from '@nangohq/utils';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from '../postgres/schema.js';

import type { DBAuditTrailEvent } from '../postgres/schema.js';
import type { AuditReader, AuditTrailPage, AuditWriter, ListAuditTrailEventsParams } from '../store.js';
import type { ApiAuditTrailEvent, SerializedAuditEvent } from '@nangohq/types';
import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

const logger = getLogger('audit');

/** Direct-write store for self-hosted and BYOC, which do not use pub/sub. */
export class PostgresAuditStore implements AuditWriter, AuditReader {
    constructor(
        private readonly knex: Knex,
        private readonly schema: string = AUDIT_SCHEMA
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
                // The driver error carries part of the event, so only the code is returned to keep the event
                // out of the logs.
                const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'unknown';
                span?.addTags({ error: code });
                return Err(new Error(`failed_to_record_audit_event: ${code}`));
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
            .where({ account_id: accountId })
            .orderBy([
                { column: 'occurred_at', order: 'desc' },
                { column: 'id', order: 'desc' }
            ])
            .limit(limit + 1);

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

import tracer from 'dd-trace';

import { Err, getLogger, Ok, stringifyError } from '@nangohq/utils';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from '../postgres/schema.js';

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
        const conditions: string[] = ['account_id = ?'];
        const bindings: unknown[] = [accountId];

        if (resources?.length) {
            if (actions?.length) {
                conditions.push('resource = ANY(?) AND action = ANY(?)');
                bindings.push(resources, actions);
            } else {
                conditions.push('resource = ANY(?)');
                bindings.push(resources);
            }
        }
        if (from) {
            conditions.push('occurred_at >= ?');
            bindings.push(from);
        }
        if (to) {
            conditions.push('occurred_at <= ?');
            bindings.push(to);
        }
        if (before) {
            conditions.push(`(occurred_at, id) < ((?::timestamp AT TIME ZONE 'UTC'), ?::uuid)`);
            bindings.push(before.occurredAt, before.id);
        }

        return await tracer.trace('nango.audit.postgres.list', async (span) => {
            try {
                // Ordered to match the primary key's (account_id, occurred_at, id), so the account predicate is an
                // equality prefix and the cursor a range on the rest.
                const { rows } = await this.knex.raw<{ rows: { event: string; cursor_id: string; cursor_occurred_at: string }[] }>(
                    `SELECT event::text AS event, id::text AS cursor_id, to_char(occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') AS cursor_occurred_at
                     FROM ??.??
                     WHERE ${conditions.join(' AND ')}
                     ORDER BY occurred_at DESC, id DESC
                     LIMIT ?`,
                    [this.schema, AUDIT_EVENTS_TABLE, ...bindings, limit + 1]
                );

                const hasMore = rows.length > limit;
                const page = rows.slice(0, limit);
                const last = page.at(-1);
                return Ok({
                    events: page.map((r) => JSON.parse(r.event) as ApiAuditTrailEvent),
                    nextCursor: hasMore && last ? { occurredAt: last.cursor_occurred_at, id: last.cursor_id } : null
                });
            } catch (err) {
                span?.addTags({ error: stringifyError(err) });
                // Nothing above this reports a failed read, so the log is the only signal a self-hosted
                // deployment without APM would get.
                logger.error(`Failed to list audit trail events: ${stringifyError(err)}`);
                return Err(new Error('failed_to_list_audit_trail_events', { cause: err }));
            } finally {
                span?.finish();
            }
        });
    }
}

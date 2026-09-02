import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';

import { cancellableDaemon, Err, getLogger, Ok, stringifyError, stringToHash } from '@nangohq/utils';

import { AUDIT_EVENTS_TABLE, AUDIT_SCHEMA } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

dayjs.extend(utc);

const logger = getLogger('audit');

const PARTITION_PREFIX = `${AUDIT_EVENTS_TABLE}_`;

function partitionName(day: dayjs.Dayjs): string {
    return `${PARTITION_PREFIX}${day.format('YYYYMMDD')}`;
}

/** `audit_trail_events_20260930` -> `20260930` */
function partitionDay(relname: string): string {
    return relname.slice(PARTITION_PREFIX.length);
}

/** One partition per UTC day: 2026-09-30 holds FROM '2026-09-30T00:00:00Z' TO '2026-10-01T00:00:00Z', upper bound excluded. */
export async function ensurePartition({ knex, schema, date }: { knex: Knex; schema: string; date: Date }): Promise<Result<void>> {
    const day = dayjs(date).utc().startOf('day');
    const name = partitionName(day);
    try {
        await knex.raw(
            `CREATE TABLE IF NOT EXISTS ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${day.toISOString()}') TO ('${day.add(1, 'day').toISOString()}')`,
            [schema, name, schema, AUDIT_EVENTS_TABLE]
        );
        return Ok(undefined);
    } catch (err) {
        return Err(new Error(`Failed to ensure audit partition ${name}`, { cause: err }));
    }
}

export async function dropExpiredPartitions({
    knex,
    schema,
    retentionDays,
    now
}: {
    knex: Knex;
    schema: string;
    retentionDays: number;
    now: Date;
}): Promise<Result<{ dropped: number; skipped: number }>> {
    const cutoff = dayjs(now).utc().startOf('day').subtract(retentionDays, 'day');
    try {
        const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
            `SELECT c.relname FROM pg_inherits i
             JOIN pg_class c ON c.oid = i.inhrelid
             JOIN pg_class p ON p.oid = i.inhparent
             JOIN pg_namespace n ON n.oid = p.relnamespace
             WHERE n.nspname = ? AND p.relname = ? AND c.relnamespace = p.relnamespace AND c.relname ~ ? ORDER BY c.relname`,
            [schema, AUDIT_EVENTS_TABLE, `^${PARTITION_PREFIX}[0-9]{8}$`]
        );
        const cutoffDay = cutoff.format('YYYYMMDD');
        const expired = rows.filter((row) => partitionDay(row.relname) < cutoffDay);

        let dropped = 0;
        let skipped = 0;
        for (const { relname } of expired) {
            // Try rather than wait: a replica that loses the race skips this partition instead of queueing.
            const held = await knex.transaction(async (trx) => {
                const lock = await trx.raw<{ rows: { held: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) AS held`, [
                    stringToHash(`audit_partition_drop:${relname}`)
                ]);
                if (!lock.rows[0]?.held) {
                    return false;
                }
                await trx.raw(`DROP TABLE IF EXISTS ??.??`, [schema, relname]);
                return true;
            });
            if (held) {
                dropped += 1;
            } else {
                skipped += 1;
            }
        }
        return Ok({ dropped, skipped });
    } catch (err) {
        return Err(new Error('Failed to drop expired audit partitions', { cause: err }));
    }
}

/** Makes sure there is a partition for today and tomorrow, and removes the ones holding expired data. */
export function startPartitionDaemon({
    knex,
    schema = AUDIT_SCHEMA,
    retentionDays,
    tickIntervalMs
}: {
    knex: Knex;
    schema?: string;
    retentionDays: number;
    tickIntervalMs: number;
}): { abort: () => Promise<void> } {
    return cancellableDaemon({
        tickIntervalMs,
        tick: async () => {
            return void (await tracer.trace('nango.audit.daemon.partitions', async (span) => {
                try {
                    const today = new Date();
                    const tomorrow = dayjs(today).utc().add(1, 'day').toDate();
                    for (const date of [today, tomorrow]) {
                        const res = await ensurePartition({ knex, schema, date });
                        if (res.isErr()) {
                            span?.addTags({ error: stringifyError(res.error, { cause: true }) });
                        }
                    }
                    const drop = await dropExpiredPartitions({ knex, schema, retentionDays, now: today });
                    if (drop.isErr()) {
                        span?.addTags({ error: stringifyError(drop.error, { cause: true }) });
                        return;
                    }
                    // A skip is a replica losing the race, which is the normal case with more than one.
                    span?.addTags({ dropped: drop.value.dropped, skipped: drop.value.skipped });
                } finally {
                    span?.finish();
                }
            }));
        },
        onError: (err) => {
            logger.error(`[audit partitions] unexpected error`, err);
        }
    });
}

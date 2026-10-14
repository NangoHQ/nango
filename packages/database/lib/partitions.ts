import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';

import { cancellableDaemon, Err, getLogger, Ok, stringifyError, stringToHash } from '@nangohq/utils';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

dayjs.extend(utc);

const logger = getLogger('database');

interface PartitionedTable {
    knex: Knex;
    schema: string;
    table: string;
}

function partitionName(table: string, day: dayjs.Dayjs): string {
    return `${table}_${day.format('YYYYMMDD')}`;
}

/** One partition per UTC day: 2026-09-30 holds FROM '2026-09-30T00:00:00Z' TO '2026-10-01T00:00:00Z', upper bound excluded. */
export async function ensureDailyPartitions({ knex, schema, table, dates }: PartitionedTable & { dates: Date[] }): Promise<Result<string[]>> {
    const ensured: string[] = [];
    let failure: Error | undefined;
    for (const date of dates) {
        const day = dayjs(date).utc().startOf('day');
        const name = partitionName(table, day);
        try {
            await knex.raw(
                `CREATE TABLE IF NOT EXISTS ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${day.toISOString()}') TO ('${day.add(1, 'day').toISOString()}')`,
                [schema, name, schema, table]
            );
            ensured.push(name);
        } catch (err) {
            // One day failing must not cost the others: tomorrow's partition is what keeps inserts working at midnight.
            failure ??= new Error(`Failed to ensure partition ${schema}.${name}`, { cause: err });
        }
    }
    return failure ? Err(failure) : Ok(ensured);
}

export async function dropExpiredDailyPartitions({
    knex,
    schema,
    table,
    retentionDays,
    now
}: PartitionedTable & { retentionDays: number; now: Date }): Promise<Result<{ dropped: number; skipped: number }>> {
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
        return Err(new Error(`Refusing to drop partitions of ${schema}.${table} with a retention of ${retentionDays} days`));
    }

    const prefix = `${table}_`;
    const cutoffDay = dayjs(now).utc().startOf('day').subtract(retentionDays, 'day').format('YYYYMMDD');
    try {
        const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
            `SELECT c.relname FROM pg_partition_tree(format('%I.%I', ?::text, ?::text)::regclass) t
             JOIN pg_class c ON c.oid = t.relid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE t.isleaf AND n.nspname = ? AND c.relname ~ ? ORDER BY c.relname`,
            [schema, table, schema, `^${prefix}[0-9]{8}$`]
        );
        const expired = rows.filter((row) => row.relname.slice(prefix.length) < cutoffDay);

        let dropped = 0;
        let skipped = 0;
        for (const { relname } of expired) {
            // Try rather than wait: a replica that loses the race skips this partition instead of queueing.
            const held = await knex.transaction(async (trx) => {
                const lock = await trx.raw<{ rows: { held: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) AS held`, [
                    stringToHash(`partition_drop:${schema}.${relname}`)
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
        return Err(new Error(`Failed to drop expired partitions of ${schema}.${table}`, { cause: err }));
    }
}

/** Makes sure there is a partition for today and tomorrow, and removes the ones holding expired data. */
export function startDailyPartitionDaemon({
    knex,
    schema,
    table,
    retentionDays,
    tickIntervalMs
}: PartitionedTable & { retentionDays: number; tickIntervalMs: number }): { abort: () => Promise<void> } {
    const label = `[${schema}.${table} partitions]`;
    return cancellableDaemon({
        tickIntervalMs,
        tick: async (): Promise<void> => {
            return tracer.trace('nango.database.daemon.partitions', { tags: { schema, table } }, async (span) => {
                try {
                    const today = new Date();
                    const tomorrow = dayjs(today).utc().add(1, 'day').toDate();
                    const ensured = await ensureDailyPartitions({ knex, schema, table, dates: [today, tomorrow] });
                    if (ensured.isErr()) {
                        span?.addTags({ error: stringifyError(ensured.error, { cause: true }) });
                        logger.error(`${label} failed to ensure partitions`, ensured.error);
                    } else {
                        span?.addTags({ ensured: ensured.value.join(',') });
                    }
                    const drop = await dropExpiredDailyPartitions({ knex, schema, table, retentionDays, now: today });
                    if (drop.isErr()) {
                        span?.addTags({ error: stringifyError(drop.error, { cause: true }) });
                        logger.error(`${label} failed to drop expired partitions`, drop.error);
                        return;
                    }
                    // A skip is a replica losing the race, which is the normal case with more than one.
                    span?.addTags({ dropped: drop.value.dropped, skipped: drop.value.skipped });
                } finally {
                    span?.finish();
                }
            });
        },
        onError: (err) => {
            logger.error(`${label} unexpected error`, err);
        }
    });
}

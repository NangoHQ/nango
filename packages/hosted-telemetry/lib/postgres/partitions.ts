import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import tracer from 'dd-trace';

import { cancellableDaemon, Err, getLogger, Ok, stringifyError, stringToHash } from '@nangohq/utils';

import { USAGE_TELEMETRY_SCHEMA, USAGE_TELEMETRY_TABLE } from './schema.js';

import type { Result } from '@nangohq/utils';
import type { Knex } from 'knex';

dayjs.extend(utc);

const logger = getLogger('usage-telemetry');

const PARTITION_PREFIX = `${USAGE_TELEMETRY_TABLE}_`;

function partitionName(day: dayjs.Dayjs): string {
    return `${PARTITION_PREFIX}${day.format('YYYYMMDD')}`;
}

function partitionDay(relname: string): string {
    return relname.slice(PARTITION_PREFIX.length);
}

export async function ensurePartitions({ knex, schema, dates }: { knex: Knex; schema: string; dates: Date[] }): Promise<Result<string[]>> {
    const ensured: string[] = [];
    let failure: Error | undefined;
    for (const date of dates) {
        const day = dayjs(date).utc().startOf('day');
        const name = partitionName(day);
        try {
            await knex.raw(
                `CREATE TABLE IF NOT EXISTS ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${day.toISOString()}') TO ('${day.add(1, 'day').toISOString()}')`,
                [schema, name, schema, USAGE_TELEMETRY_TABLE]
            );
            ensured.push(name);
        } catch (err) {
            // One day failing must not cost the others: tomorrow's partition is what keeps inserts working at midnight.
            failure ??= new Error(`Failed to ensure usage telemetry partition ${name}`, { cause: err });
        }
    }
    return failure ? Err(failure) : Ok(ensured);
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
    if (!Number.isInteger(retentionDays) || retentionDays < 1) {
        return Err(new Error(`Refusing to drop usage telemetry partitions with a retention of ${retentionDays} days`));
    }

    const cutoff = dayjs(now).utc().startOf('day').subtract(retentionDays, 'day');
    try {
        const { rows } = await knex.raw<{ rows: { relname: string }[] }>(
            `SELECT c.relname FROM pg_partition_tree(format('%I.%I', ?::text, ?::text)::regclass) t
             JOIN pg_class c ON c.oid = t.relid
             JOIN pg_namespace n ON n.oid = c.relnamespace
             WHERE t.isleaf AND n.nspname = ? AND c.relname ~ ? ORDER BY c.relname`,
            [schema, USAGE_TELEMETRY_TABLE, schema, `^${PARTITION_PREFIX}[0-9]{8}$`]
        );
        const cutoffDay = cutoff.format('YYYYMMDD');
        const expired = rows.filter((row) => partitionDay(row.relname) < cutoffDay);

        let dropped = 0;
        let skipped = 0;
        for (const { relname } of expired) {
            // Try rather than wait: a replica that loses the race skips this partition instead of queueing.
            const held = await knex.transaction(async (trx) => {
                const lock = await trx.raw<{ rows: { held: boolean }[] }>(`SELECT pg_try_advisory_xact_lock(?) AS held`, [
                    stringToHash(`usage_telemetry_partition_drop:${schema}.${relname}`)
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
        return Err(new Error('Failed to drop expired usage telemetry partitions', { cause: err }));
    }
}

/** Makes sure there is a partition for today and tomorrow, and removes the ones holding expired data. */
export function startPartitionDaemon({
    knex,
    schema = USAGE_TELEMETRY_SCHEMA,
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
        tick: async (): Promise<void> => {
            return tracer.trace('nango.usage_telemetry.daemon.partitions', async (span) => {
                try {
                    const today = new Date();
                    const tomorrow = dayjs(today).utc().add(1, 'day').toDate();
                    const ensured = await ensurePartitions({ knex, schema, dates: [today, tomorrow] });
                    if (ensured.isErr()) {
                        span?.addTags({ error: stringifyError(ensured.error, { cause: true }) });
                        logger.error('[usage telemetry partitions] failed to ensure partitions', ensured.error);
                    } else {
                        span?.addTags({ ensured: ensured.value.join(',') });
                    }
                    const drop = await dropExpiredPartitions({ knex, schema, retentionDays, now: today });
                    if (drop.isErr()) {
                        span?.addTags({ error: stringifyError(drop.error, { cause: true }) });
                        logger.error('[usage telemetry partitions] failed to drop expired partitions', drop.error);
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
            logger.error(`[usage telemetry partitions] unexpected error`, err);
        }
    });
}

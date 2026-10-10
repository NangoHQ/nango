import { report } from '@nangohq/utils';

import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type { Knex } from 'knex';

const DAY_MS = 86_400_000;
const TABLE_NAME = 'concurrency_metrics';
const PARTITION_PREFIX = `${TABLE_NAME}_`;

export class ConcurrencyPartitioningDaemon extends SchedulerDaemon {
    private readonly schema: string;
    private readonly retentionDays: number;

    constructor({
        db,
        schema,
        abortSignal,
        tickIntervalMs,
        retentionDays
    }: {
        db: Knex;
        schema: string;
        abortSignal: AbortSignal;
        tickIntervalMs: number;
        retentionDays: number;
    }) {
        super({
            name: 'ConcurrencyPartitioning',
            db,
            tickIntervalMs,
            abortSignal,
            continueOnError: true,
            onError: (err) => {
                logger.error('Concurrency partition maintenance failed', err);
                report(err);
            }
        });
        this.schema = schema;
        this.retentionDays = retentionDays;
    }

    async run(now = new Date()): Promise<void> {
        const today = new Date(now).setUTCHours(0, 0, 0, 0);
        const cutoff = now.getTime() - this.retentionDays * DAY_MS;
        await this.db.transaction(async (trx) => {
            await trx.raw('SELECT pg_advisory_xact_lock(hashtext(?), hashtext(?))', [this.schema, `${TABLE_NAME}_partitions`]);

            const { rows } = await trx.raw<{ rows: { name: string }[] }>(
                `SELECT c.relname AS name FROM pg_partition_tree(format('%I.%I', ?::text, ?::text)::regclass) p
                 JOIN pg_class c ON c.oid = p.relid JOIN pg_namespace n ON n.oid = c.relnamespace
                 WHERE p.isleaf AND n.nspname = ? AND c.relname ~ '^${PARTITION_PREFIX}[0-9]{8}$'`,
                [this.schema, TABLE_NAME, this.schema]
            );
            const existing = new Set(rows.map((row) => row.name));

            for (const day of [today, today + DAY_MS]) {
                const name = `${PARTITION_PREFIX}${new Date(day).toISOString().slice(0, 10).replaceAll('-', '')}`;
                if (existing.has(name)) continue;
                await trx.raw(
                    `CREATE TABLE ??.?? PARTITION OF ??.?? FOR VALUES FROM ('${new Date(day).toISOString()}') TO ('${new Date(day + DAY_MS).toISOString()}')`,
                    [this.schema, name, this.schema, TABLE_NAME]
                );
            }

            for (const { name } of rows) {
                const suffix = name.slice(PARTITION_PREFIX.length);
                const start = Date.parse(`${suffix.slice(0, 4)}-${suffix.slice(4, 6)}-${suffix.slice(6, 8)}T00:00:00Z`);
                if (start + DAY_MS <= cutoff) await trx.raw('DROP TABLE ??.??', [this.schema, name]);
            }
        });
    }
}

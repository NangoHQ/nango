import { logger } from '@nangohq/shared';
import { db } from './client';
import { schema, config } from './config';
import { dirname } from '../env';
import path from 'node:path';

/**
 * Run migrations manually
 */
export async function migrate(): Promise<void> {
    logger.info('[logs] migration');
    const dir = path.join(dirname, 'logs/dist/db/migrations');
    await db.raw(`CREATE SCHEMA IF NOT EXISTS ${schema}`);

    const [_, pendingMigrations] = await db.migrate.list({ ...config.migrations, directory: dir });
    console.log('prout, ', config);

    if (pendingMigrations.length === 0) {
        logger.info('[logs] nothing to do');
        return;
    }

    await db.migrate.latest({ ...config.migrations, directory: dir });
    logger.info('[logs] migrations completed.');
}

/**
 * Create daily partition.
 */
export async function createPartitions(startDay: number = 0): Promise<void> {
    logger.info('[createLogsPartition] starting');

    const from = new Date();
    from.setDate(from.getDate() + startDay);
    from.setHours(0, 0, 0, 0);

    const to = new Date(from);
    to.setHours(23, 59, 59, 999);
    to.setDate(to.getDate() + 1);

    const fromStr = from.toISOString().split('T')[0];
    const toStr = to.toISOString().split('T')[0];
    const partitionOperation = `operations_${fromStr}`;
    const partitionMessage = `messages_${fromStr}`;

    logger.info(`Creating partitions: ${partitionOperation}, ${partitionMessage}`);
    await db.raw(
        `CREATE TABLE IF NOT EXISTS "${schema}"."${partitionOperation}" PARTITION OF "${schema}"."operations" FOR VALUES FROM ('${fromStr}') TO ('${toStr}')`
    );
    await db.raw(
        `CREATE TABLE IF NOT EXISTS "${schema}"."${partitionMessage}" PARTITION OF "${schema}"."messages" FOR VALUES FROM ('${fromStr}') TO ('${toStr}')`
    );

    await db.raw(
        `CREATE INDEX IF NOT EXISTS "operations_${partitionOperation}_level" ON "${partitionOperation}" USING BTREE (account_id, environment_id, created_at DESC, level);`
    );
    await db.raw(
        `CREATE INDEX IF NOT EXISTS "operations_${partitionOperation}_state" ON "${partitionOperation}" USING BTREE (account_id, environment_id, created_at DESC, state);`
    );

    logger.info('[createLogsPartition] done');
}

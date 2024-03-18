import { logger } from '@nangohq/shared';
import { db } from './db/client';
import { schema } from './db/config';

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

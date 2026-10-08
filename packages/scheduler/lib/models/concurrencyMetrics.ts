import type { Knex } from 'knex';

const TABLE_NAME = 'concurrency_metrics';

export interface ConcurrencyMetric {
    environment_id: number;
    bucket_start: Date;
    active_concurrency: number;
}

export async function insert(db: Knex, metrics: ConcurrencyMetric[], batchSize: number = 1000): Promise<void> {
    if (metrics.length === 0) return;
    await db.transaction(async (trx) => {
        for (let offset = 0; offset < metrics.length; offset += batchSize) {
            await trx
                .table(TABLE_NAME)
                .insert(metrics.slice(offset, offset + batchSize))
                .onConflict(['bucket_start', 'environment_id'])
                .ignore();
        }
    });
}

export async function isBucketCollected(db: Knex, bucketStart: Date): Promise<boolean> {
    const lastCollectedBucket = await db.table(TABLE_NAME).select<{ bucket_start: Date }>('bucket_start').orderBy('bucket_start', 'desc').first();
    return lastCollectedBucket !== undefined && lastCollectedBucket.bucket_start >= bucketStart;
}

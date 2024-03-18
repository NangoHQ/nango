import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum } from '@nangohq/shared';
import { createPartitions } from '@nangohq/nango-logs';
import tracer from 'dd-trace';

export function createLogsPartition(): void {
    cron.schedule('*/10 * * * *', async () => {
        try {
            await exec();
        } catch (err: unknown) {
            const e = new Error('failed_to_create_logs_partitions', { cause: err instanceof Error ? err.message : err });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM }, tracer);
        }
    });
}

/**
 * Postgres does not allow DELETE LIMIT so we batch ourself to limit the memory footprint of this query.
 */
export async function exec(): Promise<void> {
    await createPartitions();
}

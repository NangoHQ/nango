import { metrics } from '@nangohq/utils';
import { envs } from '../env.js';
import { deleteOldLogs as modelDeleteOldLogs } from '../models/messages.js';
import { logger } from '../utils.js';

// Retention in days
const retention = envs.NANGO_LOGS_RETENTION;

/**
 * Delete all logs older than RETENTION days
 */
export async function deleteOldLogs(): Promise<void> {
    if (!envs.NANGO_LOGS_ENABLED) {
        return;
    }

    const start = Date.now();
    try {
        const res = await modelDeleteOldLogs({ days: retention });
        logger.info(`Deleted old logs "${res.deleted}"`);
    } catch (err: unknown) {
        throw new Error('failed_to_delete_old_logs', { cause: err instanceof Error ? err.message : err });
    } finally {
        metrics.duration(metrics.Types.JOBS_DELETE_OLD_LOGS, Date.now() - start);
    }
}

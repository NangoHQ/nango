import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum } from '@nangohq/shared';
import tracer from 'dd-trace';
import { deleteOldLogs } from '@nangohq/logs';

/**
 * Delete all activity logs older than 15 days
 */
export function cronDeleteOldLogs(): void {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cron.schedule(
        '*/15 * * * *',
        async () => {
            try {
                await deleteOldLogs();
            } catch (err: unknown) {
                errorManager.report(err, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }
        },
        { runOnInit: true }
    );
}

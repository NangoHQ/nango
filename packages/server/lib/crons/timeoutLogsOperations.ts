import { setTimeout } from 'node:timers/promises';

import * as cron from 'node-cron';

import { envs, model } from '@nangohq/logs';
import { getLogger, report } from '@nangohq/utils';

const logger = getLogger('cron.timeoutLogsOperations');
const cronMinutes = envs.CRON_TIMEOUT_LOGS_MINUTES;

export function timeoutLogsOperations(): void {
    if (!envs.NANGO_LOGS_ENABLED || envs.CRON_TIMEOUT_LOGS_MINUTES <= 0) {
        return;
    }

    cron.schedule(
        `*/${cronMinutes} * * * *`,
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            try {
                logger.info(`Starting`);
                await model.setCancelledForAuth();

                await setTimeout(15000);

                await model.setTimeoutForAll();
                logger.info(`✅ Timeouted`);
            } catch (err) {
                report(new Error('cron_failed_to_timeout_operation', { cause: err }));
            }
        },
        { runOnInit: true }
    );
}

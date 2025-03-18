import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum } from '@nangohq/shared';
import { envs, model } from '@nangohq/logs';
import { getLogger } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';

const logger = getLogger('cron.timeoutLogsOperations');
const cronMinutes = envs.CRON_TIMEOUT_LOGS_MINUTES;

export function timeoutLogsOperations(): void {
    if (!envs.NANGO_LOGS_ENABLED) {
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
                errorManager.report(err, { source: ErrorSourceEnum.PLATFORM });
            }
        },
        { runOnInit: true }
    );
}

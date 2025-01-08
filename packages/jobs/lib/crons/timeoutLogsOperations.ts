import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum } from '@nangohq/shared';
import { envs, model } from '@nangohq/logs';
import { getLogger } from '@nangohq/utils';

const logger = getLogger('Jobs.TimeoutLogsOperations');

export function timeoutLogsOperations(): void {
    if (!envs.NANGO_LOGS_ENABLED) {
        return;
    }

    cron.schedule(
        '*/10 * * * *',
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        async () => {
            try {
                logger.info(`Timeouting old operations...`);
                await model.setTimeoutForAll();
                logger.info(`✅ Timeouted`);
            } catch (err) {
                errorManager.report(err, { source: ErrorSourceEnum.PLATFORM });
            }
        }
    );
}

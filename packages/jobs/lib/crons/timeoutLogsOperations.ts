import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum } from '@nangohq/shared';
import tracer from 'dd-trace';
import { timeoutOperations } from '@nangohq/logs';

export function timeoutLogsOperations(): void {
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    cron.schedule(
        '*/10 * * * *',
        async () => {
            try {
                await timeoutOperations();
            } catch (err) {
                errorManager.report(err, { source: ErrorSourceEnum.PLATFORM }, tracer);
            }
        },
        { runOnInit: true }
    );
}

import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';

const logger = getLogger('Server');
const cronName = '[exportUsageMetrics]';
const cronMinutes = 5;

export function exportUsageMetricsCron(): void {
    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            try {
                await exec();
            } catch (err) {
                const e = new Error('failed_to_export_metrics', {
                    cause: err instanceof Error ? err.message : String(err)
                });
                errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
            }
        })().catch((err: unknown) => {
            logger.error(`Failed to execute ${cronName} cron job`);
            logger.error(err);
        });
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.server.cron.exportUsageMetrics', async (span) => {
        try {
            logger.info(`${cronName} starting`);

            const res = await connectionService.countMetric();
            if (res.isErr()) {
                throw res.error;
            }
            for (const { accountId, count } of res.value) {
                metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId });
            }
            logger.info(`${cronName} ✅ done`);
        } catch (err) {
            logger.error(`${cronName} failed: ${stringifyError(err)}`);
            span.setTag('error', err);
        }
    });
}

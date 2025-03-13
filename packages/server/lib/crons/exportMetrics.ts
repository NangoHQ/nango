import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { envs } from '../env.js';

const logger = getLogger('Server.exportUsageMetrics');
const cronMinutes = envs.CRON_EXPORT_USAGE_METRICS_MINUTES;

export function exportUsageMetricsCron(): void {
    cron.schedule(`*/${cronMinutes} * * * *`, () => {
        (async () => {
            await exec();
        })();
    });
}

export async function exec(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.server.cron.exportUsageMetrics', async (span) => {
        try {
            logger.info(`Starting`);

            const res = await connectionService.countMetric();
            if (res.isErr()) {
                throw res.error;
            }
            for (const { accountId, count } of res.value) {
                metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId });
            }
            logger.info(`✅ done`);
        } catch (err) {
            span.setTag('error', err);
            logger.error(`failed: ${stringifyError(err)}`);
            const e = new Error('failed_to_export_metrics', {
                cause: err instanceof Error ? err.message : String(err)
            });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
        }
    });
}

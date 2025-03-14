import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, connectionService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { envs } from '../env.js';

const logger = getLogger('Server.exportUsageMetrics');
const cronMinutes = envs.CRON_EXPORT_USAGE_METRICS_MINUTES;

export function exportUsageMetricsCron(): void {
    // set env var CRON_EXPORT_USAGE_METRICS_MINUTES to 0 to disable
    if (cronMinutes <= 0) {
        return;
    }
    // add some jitter to avoid all instances running at the same time
    const jitter = Math.floor(Math.random() * cronMinutes);
    cron.schedule(`*/${cronMinutes + jitter} * * * *`, () => {
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
            for (const { accountId, count, with_actions, with_syncs, with_webhooks } of res.value) {
                metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_ACTIONS_COUNT, with_actions, { accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_SYNCS_COUNT, with_syncs, { accountId });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_WEBHOOKS_COUNT, with_webhooks, { accountId });
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

import * as cron from 'node-cron';
import { errorManager, ErrorSourceEnum, connectionService, environmentService } from '@nangohq/shared';
import { stringifyError, getLogger, metrics } from '@nangohq/utils';
import tracer from 'dd-trace';
import { envs } from '../env.js';
import { records } from '@nangohq/records';

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
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics', async () => {
        logger.info(`Starting`);
        await exportConnectionsMetrics();
        await exportRecordsMetrics();
        logger.info(`✅ done`);
    });
}

async function exportConnectionsMetrics(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics.connections', async (span) => {
        try {
            const connRes = await connectionService.countMetric();
            if (connRes.isErr()) {
                throw connRes.error;
            }
            for (const { account_id, count, with_actions, with_syncs, with_webhooks } of connRes.value) {
                metrics.gauge(metrics.Types.CONNECTIONS_COUNT, count, { accountId: account_id });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_ACTIONS_COUNT, with_actions, { accountId: account_id });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_SYNCS_COUNT, with_syncs, { accountId: account_id });
                metrics.gauge(metrics.Types.CONNECTIONS_WITH_WEBHOOKS_COUNT, with_webhooks, { accountId: account_id });
            }
        } catch (err) {
            span.setTag('error', err);
            logger.error(`failed: ${stringifyError(err)}`);
            const e = new Error('failed_to_export_connections_metrics', {
                cause: err instanceof Error ? err.message : String(err)
            });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
        }
    });
}

async function exportRecordsMetrics(): Promise<void> {
    await tracer.trace<Promise<void>>('nango.cron.exportUsageMetrics.records', async (span) => {
        try {
            // Records count
            // Records db doesn't store account so we first get records count per environment
            // and then we aggregate environments per account
            const recordsRes = await records.countMetric();
            if (recordsRes.isErr()) {
                throw recordsRes.error;
            }
            const envs = await environmentService.getAll();
            if (envs.length <= 0) {
                throw new Error('no_environments');
            }
            const countByAccount = recordsRes.value.reduce((acc, { environment_id, count }) => {
                const env = envs.find((e) => e.id === environment_id);
                if (!env) {
                    return acc;
                }
                const prev = acc.get(env.account_id) || 0;
                acc.set(env.account_id, prev + Number(count));
                return acc;
            }, new Map<number, number>());

            for (const [accountId, count] of countByAccount) {
                metrics.gauge(metrics.Types.RECORDS_TOTAL_COUNT, count, { accountId });
            }
        } catch (err) {
            span.setTag('error', err);
            logger.error(`failed: ${stringifyError(err)}`);
            const e = new Error('failed_to_export_records_metrics', {
                cause: err instanceof Error ? err.message : String(err)
            });
            errorManager.report(e, { source: ErrorSourceEnum.PLATFORM });
        }
    });
}

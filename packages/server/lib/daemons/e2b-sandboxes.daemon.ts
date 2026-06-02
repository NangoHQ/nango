import { getRunningSandboxCount } from '@nangohq/sandbox';
import { cancellableDaemon, getLogger, metrics, report } from '@nangohq/utils';

import { envs } from '../env.js';

const logger = getLogger('daemon.e2bSandboxes');

interface E2BSandboxMetricOptions {
    apiKey: string;
    requestTimeoutMs: number;
}

export async function reportE2BRunningSandboxCount({ apiKey, requestTimeoutMs }: E2BSandboxMetricOptions): Promise<number> {
    const runningSandboxes = await getRunningSandboxCount({ apiKey, requestTimeoutMs });
    metrics.gauge(metrics.Types.E2B_RUNNING_SANDBOXES, runningSandboxes);
    return runningSandboxes;
}

export function e2bSandboxesDaemon(): ReturnType<typeof cancellableDaemon> | undefined {
    const apiKey = envs.E2B_API_KEY;
    if (!apiKey) {
        logger.info('E2B sandboxes daemon skipped - E2B_API_KEY not set');
        return undefined;
    }

    if (envs.E2B_SANDBOX_METRICS_POLL_INTERVAL_MS <= 0) {
        logger.info('E2B sandboxes daemon skipped - poll interval disabled');
        return undefined;
    }

    return cancellableDaemon({
        tickIntervalMs: envs.E2B_SANDBOX_METRICS_POLL_INTERVAL_MS,
        onError: (err) => {
            logger.error('E2B sandboxes daemon error', err);
            report(new Error('e2b_sandboxes_daemon_failed', { cause: err }));
        },
        tick: async (): Promise<void> => {
            try {
                await reportE2BRunningSandboxCount({
                    apiKey,
                    requestTimeoutMs: envs.E2B_SANDBOX_METRICS_REQUEST_TIMEOUT_MS
                });
            } catch (err) {
                logger.error('Failed to poll E2B running sandboxes', err);
                report(new Error('failed_to_poll_e2b_running_sandboxes', { cause: err }));
            }
        }
    });
}

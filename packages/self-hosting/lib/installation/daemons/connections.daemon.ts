import tracer from 'dd-trace';

import { hostedTelemetry } from '@nangohq/hosted-telemetry';
import { connectionService } from '@nangohq/shared';
import { cancellableDaemon, flags, getLogger } from '@nangohq/utils';

const logger = getLogger('daemon.connections');

const TICK_INTERVAL_MS = 60 * 60 * 1000;

export function connectionsDaemon(): { abort: () => Promise<void> } | undefined {
    if (!flags.hasHostedTelemetryConnections) {
        logger.info('Skipping (FLAG_HOSTED_TELEMETRY_CONNECTIONS_ENABLED is false)');
        return;
    }

    logger.info('Recording connection counts');
    return cancellableDaemon({
        tickIntervalMs: TICK_INTERVAL_MS,
        tick: () => recordConnections(),
        onError: (err) => {
            logger.error('Tick failed unexpectedly', err);
        }
    });
}

/** Nango bills on the last value it received in the month, which is why this runs hourly rather than once at the end. */
export async function recordConnections(now = new Date()): Promise<void> {
    await tracer.trace('nango.self_hosting.daemon.connections', async (span) => {
        const counts = await connectionService.countActiveAndTotalConnections(now);
        for (const { isProduction, active, total } of counts) {
            const scope = isProduction ? 'production' : 'other';
            hostedTelemetry.gauge('nango.hosted_metric.active_connections', active, { is_production: isProduction });
            hostedTelemetry.gauge('nango.hosted_metric.connections', total, { is_production: isProduction });
            span?.addTags({ [`${scope}.active`]: active, [`${scope}.total`]: total });
            logger.info(`Recorded ${active} active of ${total} connections in ${scope} environments this month`);
        }
    });
}

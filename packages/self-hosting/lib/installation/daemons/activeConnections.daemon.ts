import tracer from 'dd-trace';

import { hostedTelemetry } from '@nangohq/hosted-telemetry';
import { connectionService } from '@nangohq/shared';
import { cancellableDaemon, flags, getLogger } from '@nangohq/utils';

const logger = getLogger('daemon.activeConnections');

const TICK_INTERVAL_MS = 60 * 60 * 1000;

export function activeConnectionsDaemon(): { abort: () => Promise<void> } | undefined {
    if (!flags.hasHostedTelemetryActiveConnections) {
        logger.info('Skipping (FLAG_HOSTED_TELEMETRY_ACTIVE_CONNECTIONS_ENABLED is false)');
        return;
    }

    logger.info('Recording active connections');
    return cancellableDaemon({
        tickIntervalMs: TICK_INTERVAL_MS,
        tick: () => recordActiveConnections(),
        onError: (err) => {
            logger.error('Tick failed unexpectedly', err);
        }
    });
}

/** Nango bills on the last value it received in the month, which is why this runs hourly rather than once at the end. */
export async function recordActiveConnections(now = new Date()): Promise<void> {
    await tracer.trace('nango.self_hosting.daemon.activeConnections', async (span) => {
        const counts = await connectionService.countActiveMonthlyConnections(now);
        hostedTelemetry.gauge('nango.hosted_metric.active_connections', counts.production, { is_production: true });
        hostedTelemetry.gauge('nango.hosted_metric.active_connections', counts.other, { is_production: false });
        span?.addTags({ production: counts.production, other: counts.other });
        logger.info(`Recorded ${counts.production} active connections in production environments and ${counts.other} in the others this month`);
    });
}

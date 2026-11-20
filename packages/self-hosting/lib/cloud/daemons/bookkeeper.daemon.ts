import tracer from 'dd-trace';

import { cancellableDaemon, getLogger, metrics } from '@nangohq/utils';

import { listInstallationStatuses } from '../services/installation.service.js';

import type { RegistryDb } from '../services/db.js';
import type { InstallationStatus } from '../services/installation.service.js';

const logger = getLogger('daemon.bookkeeper');

const TICK_INTERVAL_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function bookkeeperDaemon(db: RegistryDb): { abort: () => Promise<void> } {
    return cancellableDaemon({
        tickIntervalMs: TICK_INTERVAL_MS,
        tick: () => bookkeeperTick(db),
        onError: (err) => {
            logger.error('Tick failed unexpectedly', err);
        }
    });
}

export async function bookkeeperTick(db: RegistryDb): Promise<void> {
    await tracer.trace('nango.self_hosting.daemon.bookkeeper', async (span) => {
        const installations = await listInstallationStatuses(db);
        if (installations.isErr()) {
            span?.setTag('error', installations.error);
            logger.error('Could not read the installations', installations.error);
            return;
        }

        const now = Date.now();
        const counts: Record<string, Pick<InstallationStatus, 'mode' | 'stage'> & { count: number }> = {};
        for (const { name, customer, mode, stage, telemetry, last_seen_at, license_expires_at } of installations.value) {
            const tags = { installation: name, customer };
            if (license_expires_at) {
                metrics.gauge(metrics.Types.SELF_HOSTING_LICENSE_EXPIRES_IN_DAYS, (license_expires_at.getTime() - now) / DAY_MS, tags);
            }
            // An installation that was never seen is still being set up.
            if (telemetry && last_seen_at) {
                metrics.gauge(metrics.Types.SELF_HOSTING_INSTALLATION_LAST_SEEN_HOURS, (now - last_seen_at.getTime()) / HOUR_MS, tags);
            }
            (counts[`${mode}/${stage}`] ??= { mode, stage, count: 0 }).count++;
        }
        for (const { mode, stage, count } of Object.values(counts)) {
            metrics.gauge(metrics.Types.SELF_HOSTING_INSTALLATIONS, count, { mode, stage });
        }
    });
}

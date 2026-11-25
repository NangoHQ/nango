import tracer from 'dd-trace';

import { cancellableDaemon, getLogger, metrics } from '@nangohq/utils';

import { INSTALLATION_MODES, INSTALLATION_STAGES, listInstallationStatuses } from '../services/installation.service.js';

import type { RegistryDb } from '../services/db.js';

const logger = getLogger('daemon.bookkeeper');

const TICK_INTERVAL_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const NOT_ALLOWED_IN_A_TAG = /[^a-z0-9_./-]/gi;

function sanitizedTagValue(value: string): string {
    return value.replaceAll(NOT_ALLOWED_IN_A_TAG, '_');
}

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
        for (const { name, customer, telemetry, last_seen_at, license_expires_at } of installations.value) {
            const tags = { installation: sanitizedTagValue(name), customer: sanitizedTagValue(customer) };
            if (license_expires_at) {
                metrics.gauge(metrics.Types.SELF_HOSTING_LICENSE_EXPIRES_IN_DAYS, (license_expires_at.getTime() - now) / DAY_MS, tags);
            }
            // An installation that was never seen is still being set up.
            if (telemetry && last_seen_at) {
                metrics.gauge(metrics.Types.SELF_HOSTING_INSTALLATION_LAST_SEEN_HOURS, (now - last_seen_at.getTime()) / HOUR_MS, tags);
            }
        }
        // Zero is reported too, or a group that lost its last installation would keep its last count in Datadog.
        for (const mode of INSTALLATION_MODES) {
            for (const stage of INSTALLATION_STAGES) {
                const count = installations.value.filter((installation) => installation.mode === mode && installation.stage === stage).length;
                metrics.gauge(metrics.Types.SELF_HOSTING_INSTALLATIONS, count, { mode, stage });
            }
        }
    });
}

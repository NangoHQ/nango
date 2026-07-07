import { getDeviceId } from '../state.js';
import { getCliHeaders, isCliDebugEnabled, isTelemetryDisabled, printDebug, resolveHostport } from '../utils.js';

import type { CliTelemetryEvent, PostCliTelemetry } from '@nangohq/types';

const TELEMETRY_TIMEOUT_MS = 2000;

export { isTelemetryDisabled };

/**
 * Send an anonymous CLI usage event. Fire-and-forget
 */
export function trackCliEvent(event: CliTelemetryEvent): void {
    if (isTelemetryDisabled()) {
        return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEMETRY_TIMEOUT_MS);

    const { deviceId, ephemeral } = getDeviceId();
    const body: PostCliTelemetry['Body'] = { deviceId, event, ephemeral };
    void fetch(new URL('/cli/telemetry', resolveHostport()), {
        method: 'POST',
        body: JSON.stringify(body),
        headers: new Headers({ ...getCliHeaders(), 'content-type': 'application/json' }),
        signal: controller.signal
    })
        .catch((err) => {
            printDebug(`Telemetry delivery failed: ${err instanceof Error ? err.message : String(err)}`, isCliDebugEnabled());
        })
        .finally(() => {
            clearTimeout(timeout);
        });
}

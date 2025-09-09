import type { TelemetryBagJSON } from '@nangohq/types';

export class TelemetryBag {
    customLogs: number = 0;
    proxyCalls: number = 0;

    toJSON(): TelemetryBagJSON {
        return {
            customLogs: this.customLogs,
            proxyCalls: this.proxyCalls
        };
    }
}

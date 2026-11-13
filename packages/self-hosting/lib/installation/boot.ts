import { logger } from '../utils.js';
import { uploadTelemetryCron } from './crons/uploadTelemetry.js';
import { manualTelemetryExportConfig } from './manual-telemetry-export.js';

import type { ManualTelemetryExportConfig } from './manual-telemetry-export.js';

export async function boot(): Promise<{ manualTelemetryExport: ManualTelemetryExportConfig | null }> {
    await uploadTelemetryCron();

    const manualTelemetryExport = await manualTelemetryExportConfig();
    if (manualTelemetryExport.isErr()) {
        logger.warning(`The manual export of the telemetry is off (${manualTelemetryExport.error.message})`);
        return { manualTelemetryExport: null };
    }
    return { manualTelemetryExport: manualTelemetryExport.value };
}

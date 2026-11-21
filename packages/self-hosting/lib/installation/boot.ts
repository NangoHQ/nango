import { logger } from '../utils.js';
import { uploadTelemetryDaemon } from './daemons/uploadTelemetry.daemon.js';
import { manualTelemetryExportConfig } from './manual-telemetry-export.js';

import type { ManualTelemetryExportConfig } from './manual-telemetry-export.js';

export async function boot(): Promise<{
    uploadTelemetry: Awaited<ReturnType<typeof uploadTelemetryDaemon>>;
    manualTelemetryExport: ManualTelemetryExportConfig | null;
}> {
    const uploadTelemetry = await uploadTelemetryDaemon();

    const manualTelemetryExport = await manualTelemetryExportConfig();
    if (manualTelemetryExport.isErr()) {
        logger.warning(`The manual export of the telemetry is off (${manualTelemetryExport.error.message})`);
        return { uploadTelemetry, manualTelemetryExport: null };
    }
    return { uploadTelemetry, manualTelemetryExport: manualTelemetryExport.value };
}

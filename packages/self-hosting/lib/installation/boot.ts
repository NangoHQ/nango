import { logger } from '../utils.js';
import { activeConnectionsDaemon } from './daemons/activeConnections.daemon.js';
import { uploadTelemetryDaemon } from './daemons/uploadTelemetry.daemon.js';
import { manualTelemetryExportConfig } from './manual-telemetry-export.js';

import type { ManualTelemetryExportConfig } from './manual-telemetry-export.js';

export async function boot(): Promise<{
    uploadTelemetry: Awaited<ReturnType<typeof uploadTelemetryDaemon>>;
    activeConnections: ReturnType<typeof activeConnectionsDaemon>;
    manualTelemetryExport: ManualTelemetryExportConfig | null;
}> {
    const uploadTelemetry = await uploadTelemetryDaemon();
    const activeConnections = activeConnectionsDaemon();

    const manualTelemetryExport = await manualTelemetryExportConfig();
    if (manualTelemetryExport.isErr()) {
        logger.warning(`The manual export of the telemetry is off (${manualTelemetryExport.error.message})`);
        return { uploadTelemetry, activeConnections, manualTelemetryExport: null };
    }
    return { uploadTelemetry, activeConnections, manualTelemetryExport: manualTelemetryExport.value };
}

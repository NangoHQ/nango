import { hostedTelemetryDb, initHostedTelemetry } from '@nangohq/hosted-telemetry';

import { logger } from '../utils.js';
import { connectionsDaemon } from './daemons/connections.daemon.js';
import { uploadTelemetryDaemon } from './daemons/uploadTelemetry.daemon.js';
import { manualTelemetryExportConfig } from './manual-telemetry-export.js';

import type { ManualTelemetryExportConfig } from './manual-telemetry-export.js';

export async function boot(): Promise<{
    uploadTelemetry: Awaited<ReturnType<typeof uploadTelemetryDaemon>>;
    connections: ReturnType<typeof connectionsDaemon>;
    manualTelemetryExport: ManualTelemetryExportConfig | null;
}> {
    const uploadTelemetry = await uploadTelemetryDaemon();

    const telemetryDb = hostedTelemetryDb();
    if (telemetryDb) {
        initHostedTelemetry({ knex: telemetryDb });
    } else {
        logger.warning('Not recording connection counts (hosted telemetry has no database)');
    }
    const connections = telemetryDb ? connectionsDaemon() : undefined;

    const manualTelemetryExport = await manualTelemetryExportConfig();
    if (manualTelemetryExport.isErr()) {
        logger.warning(`The manual export of the telemetry is off (${manualTelemetryExport.error.message})`);
        return { uploadTelemetry, connections, manualTelemetryExport: null };
    }
    return { uploadTelemetry, connections, manualTelemetryExport: manualTelemetryExport.value };
}

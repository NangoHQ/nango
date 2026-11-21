import express from 'express';

import { createRoute } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from '../routes/getHealth.js';
import { notFound } from '../routes/notFound.js';
import { serverError } from '../routes/serverError.js';
import { manualTelemetryExportKeyMiddleware } from './middleware/manual-telemetry-export-key.middleware.js';
import { routeHandler as getExportHandler } from './routes/v1/telemetry/getExport.js';

import type { ManualTelemetryExportConfig } from './manual-telemetry-export.js';
import type { Express } from 'express';

export function createInstallationServer({ manualTelemetryExport }: { manualTelemetryExport: ManualTelemetryExportConfig | null }): Express {
    const server = express();
    server.disable('x-powered-by');

    createRoute(server, getHealthHandler);
    if (manualTelemetryExport) {
        createRoute(server, getExportHandler(manualTelemetryExport), { middleware: [manualTelemetryExportKeyMiddleware(manualTelemetryExport.key)] });
    }
    server.use(notFound);
    server.use(serverError);

    return server;
}

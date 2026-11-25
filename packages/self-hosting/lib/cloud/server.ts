import express from 'express';

import { createRoute } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from '../routes/getHealth.js';
import { notFound } from '../routes/notFound.js';
import { serverError } from '../routes/serverError.js';
import { installationTokenBodyMiddleware, installationTokenMiddleware } from './middleware/installation-token.middleware.js';
import { readUploadBodyMiddleware } from './middleware/upload-body.middleware.js';
import { routeHandler as postUploadsHandler } from './routes/v1/telemetry/postUploads.js';

import type { RegistryDb } from './services/db.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { Express } from 'express';

export function createCloudServer({ db, clickhouse }: { db: RegistryDb; clickhouse: ClickHouseClient }): Express {
    const server = express();
    server.disable('x-powered-by');

    createRoute(server, getHealthHandler);
    createRoute(server, postUploadsHandler(clickhouse), {
        middleware: [installationTokenMiddleware(db), readUploadBodyMiddleware, installationTokenBodyMiddleware]
    });
    server.use(notFound);

    server.use(serverError);

    return server;
}

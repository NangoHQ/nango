import express from 'express';

import { createRoute } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from '../routes/getHealth.js';
import { notFound } from '../routes/notFound.js';
import { logger } from '../utils.js';
import { installationTokenMiddleware } from './middleware/installation-token.middleware.js';
import { readUploadBodyMiddleware } from './middleware/upload-body.middleware.js';
import { routeHandler as postUploadsHandler } from './routes/v1/telemetry/postUploads.js';

import type { RegistryDb } from './services/db.js';
import type { ClickHouseClient } from '@clickhouse/client';
import type { ApiError } from '@nangohq/types';
import type { Express, NextFunction, Request, Response } from 'express';

export function createCloudServer({ db, clickhouse }: { db: RegistryDb; clickhouse: ClickHouseClient }): Express {
    const server = express();
    server.disable('x-powered-by');

    createRoute(server, getHealthHandler);
    createRoute(server, postUploadsHandler(clickhouse), { middleware: [readUploadBodyMiddleware, installationTokenMiddleware(db)] });
    server.use(notFound);

    server.use((err: unknown, _req: Request, res: Response<ApiError<'server_error'>>, _next: NextFunction) => {
        logger.error('Unhandled error', err);
        res.status(500).json({ error: { code: 'server_error' } });
    });

    return server;
}

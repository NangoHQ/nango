import express from 'express';

import { createRoute } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from '../routes/getHealth.js';
import { notFound } from '../routes/notFound.js';

import type { Express } from 'express';

export function createInstallationServer(): Express {
    const server = express();
    server.disable('x-powered-by');

    createRoute(server, getHealthHandler);
    server.use(notFound);

    return server;
}

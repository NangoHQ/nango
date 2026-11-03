import express from 'express';

import { createRoute } from '@nangohq/utils';

import { routeHandler as getHealthHandler } from './routes/getHealth.js';

export const server = express();
server.disable('x-powered-by');

createRoute(server, getHealthHandler);

server.use((_req, res) => {
    res.status(404).json({ error: { code: 'not_found' } });
});

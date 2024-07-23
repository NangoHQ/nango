import './tracer.js';
import './utils/loadEnv.js';

import express from 'express';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { NANGO_VERSION, getGlobalOAuthCallbackUrl, getServerPort, getWebsocketsPath } from '@nangohq/shared';
import { getLogger, requestLoggerMiddleware } from '@nangohq/utils';
import oAuthSessionService from './services/oauth-session.service.js';
import migrate from './utils/migrate.js';
import { migrate as migrateRecords } from '@nangohq/records';
import { start as migrateLogs } from '@nangohq/logs';

import publisher from './clients/publisher.client.js';
import { router } from './routes.js';
import { refreshTokens } from './refreshTokens.js';

const { NANGO_MIGRATE_AT_START = 'true' } = process.env;
const logger = getLogger('Server');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Log all requests
if (process.env['ENABLE_REQUEST_LOG'] !== 'false') {
    app.use(requestLoggerMiddleware({ logger }));
}

// Load all routes
app.use('/', router);

const server = http.createServer(app);

// -------
// Websocket
const wss = new WebSocketServer({ server, path: getWebsocketsPath() });

wss.on('connection', async (ws: WebSocket) => {
    await publisher.subscribe(ws);
});

// Set to 'false' to disable migration at startup. Appropriate when you
// have multiple replicas of the service running and you do not want them
// all trying to migrate the database at the same time. In this case, the
// operator should run migrate.ts once before starting the service.
if (NANGO_MIGRATE_AT_START === 'true') {
    await migrate();
    await migrateLogs();
    await migrateRecords();
} else {
    logger.info('Not migrating database');
}

await oAuthSessionService.clearStaleSessions();
refreshTokens();

const port = getServerPort();
server.listen(port, () => {
    logger.info(`✅ Nango Server with version ${NANGO_VERSION} is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});

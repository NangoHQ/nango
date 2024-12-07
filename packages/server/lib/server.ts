import './tracer.js';
import './utils/loadEnv.js';

import express from 'express';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { NANGO_VERSION, getGlobalOAuthCallbackUrl, getOtlpRoutes, getProviders, getServerPort, getWebsocketsPath } from '@nangohq/shared';
import { getLogger, requestLoggerMiddleware } from '@nangohq/utils';
import oAuthSessionService from './services/oauth-session.service.js';
import { KnexDatabase } from '@nangohq/database';
import migrate from './utils/migrate.js';
import { migrate as migrateRecords } from '@nangohq/records';
import { start as migrateLogs, otlp } from '@nangohq/logs';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { runnersFleet } from './fleet.js';

import publisher from './clients/publisher.client.js';
import { router } from './routes.js';
import { refreshConnectionsCron } from './refreshConnections.js';

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
    const db = new KnexDatabase({ timeoutMs: 0 }); // Disable timeout for migrations
    await migrate(db);
    await migrateKeystore(db.knex);
    await migrateLogs();
    await migrateRecords();
    await runnersFleet.migrate();
} else {
    logger.info('Not migrating database');
}

// Preload providers
getProviders();

await oAuthSessionService.clearStaleSessions();
refreshConnectionsCron();
otlp.register(getOtlpRoutes);

const port = getServerPort();
server.listen(port, () => {
    logger.info(`✅ Nango Server with version ${NANGO_VERSION} is listening on port ${port}. OAuth callback URL: ${getGlobalOAuthCallbackUrl()}`);
    logger.info(
        `\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |  \n \\ | / \\ | / \\ | / \\ | / \\ | / \\ | / \\ | /\n  \\|/   \\|/   \\|/   \\|/   \\|/   \\|/   \\|/\n------------------------------------------\nLaunch Nango at http://localhost:${port}\n------------------------------------------\n  /|\\   /|\\   /|\\   /|\\   /|\\   /|\\   /|\\\n / | \\ / | \\ / | \\ / | \\ / | \\ / | \\ / | \\\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |\n   |     |     |     |     |     |     |`
    );
});

import './tracer.js';
import './utils/loadEnv.js';

import express from 'express';
import * as cron from 'node-cron';
import type { WebSocket } from 'ws';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import { getGlobalOAuthCallbackUrl, getOtlpRoutes, getProviders, getServerPort, getWebsocketsPath } from '@nangohq/shared';
import { getLogger, once, requestLoggerMiddleware, initSentry, NANGO_VERSION, report } from '@nangohq/utils';
import oAuthSessionService from './services/oauth-session.service.js';
import db, { KnexDatabase } from '@nangohq/database';
import migrate from './utils/migrate.js';
import { destroy as destroyRecords, migrate as migrateRecords } from '@nangohq/records';
import { start as migrateLogs, otlp, destroy as destroyLogs } from '@nangohq/logs';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { runnersFleet } from './fleet.js';
import publisher from './clients/publisher.client.js';
import { router } from './routes.js';
import { refreshConnectionsCron } from './refreshConnections.js';
import { envs } from './env.js';
import { destroy as destroyKvstore } from '@nangohq/kvstore';

const { NANGO_MIGRATE_AT_START = 'true' } = process.env;
const logger = getLogger('Server');

initSentry({ dsn: envs.SENTRY_DSN, applicationName: envs.NANGO_DB_APPLICATION_NAME, hash: envs.GIT_HASH });

process.on('unhandledRejection', (reason) => {
    logger.error('Received unhandledRejection...', reason);
    report(reason);
    // not closing on purpose
});

process.on('uncaughtException', (err) => {
    logger.error('Received uncaughtException...', err);
    report(err);
    // not closing on purpose
});

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
    await db.destroy();
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

// --- Close function
const close = once(() => {
    logger.info('Closing...');

    cron.getTasks().forEach((task) => task.stop());

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.close(async () => {
        wss.close();
        await runnersFleet.stop();
        await db.destroy();
        await destroyRecords();
        await destroyLogs();
        otlp.stop();
        await destroyKvstore();

        logger.close();

        console.info('Closed');

        // TODO: close redis
        process.exit();
    });
});

process.on('SIGINT', () => {
    logger.info('Received SIGINT...');
    close();
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM...');
    close();
});

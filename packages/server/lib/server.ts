import './tracer.js';
import './utils/loadEnv.js';

import http from 'node:http';

import express from 'express';
import * as cron from 'node-cron';
import { WebSocketServer } from 'ws';

import { billing } from '@nangohq/billing';
import db, { KnexDatabase } from '@nangohq/database';
import { migrate as migrateKeystore } from '@nangohq/keystore';
import { destroy as destroyKvstore } from '@nangohq/kvstore';
import { destroy as destroyLogs, otlp, start as migrateLogs } from '@nangohq/logs';
import { destroy as destroyRecords, migrate as migrateRecords } from '@nangohq/records';
import { getGlobalOAuthCallbackUrl, getOtlpRoutes, getProviders, getServerPort, getWebsocketsPath } from '@nangohq/shared';
import { NANGO_VERSION, getLogger, initSentry, once, report } from '@nangohq/utils';

import publisher from './clients/publisher.client.js';
import { deleteOldData } from './crons/deleteOldData.js';
import { refreshConnectionsCron } from './crons/refreshConnections.js';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';
import { trialCron } from './crons/trial.js';
import { envs } from './env.js';
import { runnersFleet } from './fleet.js';
import { pubsub } from './pubsub.js';
import { router } from './routes.js';
import migrate from './utils/migrate.js';

import type { WebSocket } from 'ws';

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
app.set('query parser', 'extended');
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Load all routes
app.use('/', router);

const server = http.createServer(app);

server.keepAliveTimeout = envs.NANGO_SERVER_KEEP_ALIVE_TIMEOUT;
server.headersTimeout = envs.NANGO_SERVER_KEEP_ALIVE_TIMEOUT + 1000; //needs to be longer than the keep alive timeout to avoid premature disconnections
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

refreshConnectionsCron();
timeoutLogsOperations();
deleteOldData();
trialCron();
void otlp.register(getOtlpRoutes);

const pubsubConnect = await pubsub.connect();
if (pubsubConnect.isErr()) {
    logger.error(`PubSub: Failed to connect to transport: ${pubsubConnect.error.message}`);
}

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
        await billing.shutdown();
        await pubsub.disconnect();

        logger.close();

        console.info('Closed');

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

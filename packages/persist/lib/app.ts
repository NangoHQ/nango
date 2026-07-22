import './tracer.js';

import db from '@nangohq/database';
import { destroy as destroyFeatureFlags, initialize as initializeFeatureFlags } from '@nangohq/feature-flags';
import { destroy as destroyKvstore } from '@nangohq/kvstore';
import { destroy as destroyLogs } from '@nangohq/logs';
import { records } from '@nangohq/records';
import { getLogger, once, report } from '@nangohq/utils';

import { autoDeletingDaemon } from './daemons/autodeleting.daemon.js';
import { autoPruningDaemon } from './daemons/autopruning.daemon.js';
import { envs } from './env.js';
import { pubsub } from './pubsub.js';
import { server } from './server.js';

import type { Server } from 'node:http';

const logger = getLogger('Persist');

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

let api: Server;
const autoPruning = autoPruningDaemon();
const autoDeleting = autoDeletingDaemon();
records.startDaemons();

try {
    await initializeFeatureFlags();

    const pubsubConnect = await pubsub.connect();
    if (pubsubConnect.isErr()) {
        logger.error(`PubSub: Failed to connect to transport: ${pubsubConnect.error.message}`);
    }

    const port = envs.NANGO_PERSIST_PORT;
    api = server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);
    });
    if (envs.NANGO_PERSIST_KEEP_ALIVE_TIMEOUT_MS && envs.NANGO_PERSIST_KEEP_ALIVE_TIMEOUT_MS > 0) {
        api.keepAliveTimeout = envs.NANGO_PERSIST_KEEP_ALIVE_TIMEOUT_MS;
        api.headersTimeout = envs.NANGO_PERSIST_KEEP_ALIVE_TIMEOUT_MS + 1000;
    }
} catch (err) {
    console.error(`Persist API error`, err);
    process.exit(1);
}

// --- Close function
const close = once(() => {
    logger.info('Closing...');
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    api.close(async () => {
        await autoPruning.abort();
        await autoDeleting.abort();
        await destroyFeatureFlags();
        await destroyLogs();
        await db.knex.destroy();
        await db.readOnly.destroy();
        await records.close();
        await pubsub.disconnect();
        await destroyKvstore();

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

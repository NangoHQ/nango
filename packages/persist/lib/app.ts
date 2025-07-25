import './tracer.js';

import { billing } from '@nangohq/billing';
import db from '@nangohq/database';
import { destroy as destroyLogs } from '@nangohq/logs';
import { destroy as destroyRecords } from '@nangohq/records';
import { getLogger, initSentry, once, report } from '@nangohq/utils';

import { envs } from './env.js';
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

initSentry({ dsn: envs.SENTRY_DSN, applicationName: envs.NANGO_DB_APPLICATION_NAME, hash: envs.GIT_HASH });

let api: Server;

try {
    const port = envs.NANGO_PERSIST_PORT;
    api = server.listen(port, () => {
        logger.info(`🚀 API ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Persist API error`, err);
    process.exit(1);
}

// --- Close function
const close = once(() => {
    logger.info('Closing...');
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    api.close(async () => {
        await destroyLogs();
        await db.knex.destroy();
        await db.readOnly.destroy();
        await destroyRecords();
        await billing.shutdown();

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

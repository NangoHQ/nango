import './tracer.js';
import { getLogger, once } from '@nangohq/utils';
import { server } from './server.js';
import { envs } from './env.js';
import type { Server } from 'node:http';
import db from '@nangohq/database';
import { destroy as destroyRecords } from '@nangohq/records';

const logger = getLogger('Persist');

process.on('unhandledRejection', (reason) => {
    logger.error('Received unhandledRejection...', reason);
    // not closing on purpose
});

process.on('uncaughtException', (err) => {
    logger.error('Received uncaughtException...', err);
    // not closing on purpose
});

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
        // TODO: close logs

        await db.knex.destroy();
        await db.readOnly.destroy();
        await destroyRecords();

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

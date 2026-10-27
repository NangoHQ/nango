import './tracer.js';

import db from '@nangohq/database';
import { metrics, once, report } from '@nangohq/utils';

import { boot as bootCloud } from './cloud/boot.js';
import { envs } from './env.js';
import { boot as bootInstallation } from './installation/boot.js';
import { mode } from './mode.js';
import { server } from './server.js';
import { logger } from './utils.js';

import type { Server } from 'node:http';

process.on('unhandledRejection', (reason) => {
    logger.error('Received unhandledRejection...', reason);
    report(reason);
});

process.on('uncaughtException', (err) => {
    logger.error('Received uncaughtException...', err);
    report(err);
});

let api: Server;

try {
    if (mode === 'cloud') {
        await bootCloud();
    } else {
        await bootInstallation();
    }

    const port = envs.NANGO_SELF_HOSTING_PORT;
    api = server.listen(port, () => {
        logger.info(`🚀 self-hosting (${mode}) ready at http://localhost:${port}`);
    });
    api.once('error', (err) => {
        logger.error('Failed to listen', err);
        process.exit(1);
    });
} catch (err) {
    logger.error('Failed to start', err);
    process.exit(1);
}

const close = once(() => {
    logger.info('Closing...');
    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    api.close(async () => {
        await db.knex.destroy();
        logger.close();
        await metrics.flush();
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

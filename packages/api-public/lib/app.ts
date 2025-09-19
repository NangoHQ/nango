import Fastify from 'fastify';

import { initSentry, once, report } from '@nangohq/utils';

import createApp, { options } from './fastify.js';
import { envs } from './utils/envs.js';
import { logger } from './utils/logger.js';

try {
    process.on('unhandledRejection', (reason) => {
        logger.error('Received unhandledRejection...', reason);
        report(reason);
    });

    process.on('uncaughtException', (err) => {
        logger.error('Received uncaughtException...', err);
        report(err);
    });

    initSentry({ dsn: envs.SENTRY_DSN, applicationName: envs.NANGO_DB_APPLICATION_NAME, hash: envs.GIT_HASH });

    // Instantiate Fastify with some config
    const app = Fastify(options);

    // Register your application as a normal plugin.
    void app.register(createApp);

    // Graceful shutdown
    const close = once(async () => {
        await app.close();
        process.exit();
    });

    process.on('SIGINT', () => {
        logger.info('Received SIGINT...');
        close();
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM...');
        close();
    });

    app.listen({ host: '0.0.0.0', port: envs.NANGO_PORT }, (err) => {
        if (err) {
            app.log.error(err);
            process.exit(1);
        }

        logger.info(`Started http://localhost:${envs.NANGO_PORT}`);
    });
} catch {
    process.exit(1);
}

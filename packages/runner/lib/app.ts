import './tracer.js';
import { server } from './server.js';
import { stringifyError } from '@nangohq/utils';
import { logger } from './utils.js';
import { monitorProviders } from '@nangohq/shared';
import { register } from './register.js';

const providersMonitorCleanup = await monitorProviders();

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    const srv = server.listen(port, () => {
        logger.info(`🏃‍♀️ Runner '${id}' ready at http://localhost:${port}`);
    });

    const close = () => {
        logger.info('Closing...');
        providersMonitorCleanup();

        srv.close(() => {
            process.exit();
        });
    };

    process.on('SIGINT', () => {
        logger.info('Received SIGINT...');
        close();
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM...');
        close();
    });

    process.on('unhandledRejection', (reason) => {
        logger.error('Received unhandledRejection...', reason);
        process.exitCode = 1;
        close();
    });

    process.on('uncaughtException', (e) => {
        logger.error('Received uncaughtException...', e);
        // not closing on purpose
    });

    const res = await register({ port });
    if (res.isErr()) {
        logger.error(`Unable to register runner: ${res.error}`);
        // not exiting on purpose because REMOTE runner are not registering
    }
} catch (err) {
    logger.error(`Unable to start runner: ${stringifyError(err)}`);
    process.exit(1);
}

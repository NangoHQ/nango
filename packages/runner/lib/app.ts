import './tracer.js';
import { server } from './server.js';
import { stringifyError } from '@nangohq/utils';
import { logger } from './utils.js';
import { monitorProviders } from '@nangohq/shared';

await monitorProviders();

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || process.env['RUNNER_ID'] || 'unknown-id';
    const srv = server.listen(port, () => {
        logger.info(`🚀 '${id}' ready at http://localhost:${port}`);
    });

    const close = () => {
        logger.info('Closing...');
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
} catch (err) {
    logger.error(`Unable to start runner: ${stringifyError(err)}`);
    process.exit(1);
}

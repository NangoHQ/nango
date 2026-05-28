import './tracer.js';
import { monitorProviders } from '@nangohq/shared';
import { stringifyError } from '@nangohq/utils';

import { envs } from './env.js';
import { logger } from './logger.js';
import { register } from './register.js';
import { server } from './server.js';

const providersMonitorCleanup = await monitorProviders();

try {
    const port = parseInt(process.argv[2] || '') || 3006;
    const id = process.argv[3] || envs.RUNNER_NODE_ID;
    const srv = server.listen(port, async () => {
        logger.info(`🏃‍♀️ '${id}' ready at http://localhost:${port}`);

        const res = await register();
        if (res.isErr()) {
            logger.error(`${id} Unable to register`, res.error);
        }
    });

    const close = () => {
        logger.info(`${id} Closing...`);
        providersMonitorCleanup();

        srv.close(() => {
            process.exit();
        });
    };

    process.on('SIGINT', () => {
        logger.info(`${id} Received SIGINT...`);
        close();
    });

    process.on('SIGTERM', () => {
        logger.info(`${id} Received SIGTERM...`);
        close();
    });

    process.on('unhandledRejection', (reason) => {
        logger.error(`${id} Received uncaughtException...`, reason);
        // not closing on purpose
    });

    process.on('uncaughtException', (e) => {
        logger.error(`${id} Received uncaughtException...`, e);
        // not closing on purpose
    });
} catch (err) {
    logger.error(`Unable to start runner: ${stringifyError(err)}`);
    process.exit(1);
}

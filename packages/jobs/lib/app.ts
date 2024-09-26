import './tracer.js';
import { Processor } from './processor/processor.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';
import { envs } from './env.js';
import db from '@nangohq/database';

const logger = getLogger('Jobs');

try {
    const port = envs.NANGO_JOBS_PORT;
    const orchestratorUrl = envs.ORCHESTRATOR_SERVICE_URL;
    const srv = server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const processor = new Processor(orchestratorUrl);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    const healthCheck = setInterval(async () => {
        const start = Date.now();
        try {
            await db.knex.raw('SELECT 1');
            if (Date.now() - start > 1000) {
                logger.info('HealthCheck too long...');
                void close();
            }
        } catch (err) {
            logger.info('HealthCheck failed...', err);
            void close();
        }
    }, 1000);

    const close = async () => {
        clearInterval(healthCheck);
        processor.stop();
        await db.knex.destroy();
        srv.close(() => {
            process.exit();
        });
    };

    process.on('SIGINT', () => {
        logger.info('Received SIGINT...');
        void close();
    });

    process.on('SIGTERM', () => {
        logger.info('Received SIGTERM...');
        void close();
    });

    process.on('unhandledRejection', (reason) => {
        logger.info('Received unhandledRejection...', reason);
        process.exitCode = 1;
        void close();
    });

    process.on('uncaughtException', (e) => {
        logger.info('Received uncaughtException...', e);
        // not closing on purpose
    });

    processor.start();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteSyncsData();
    timeoutLogsOperations();
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}

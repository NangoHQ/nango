import './tracer.js';
import { Processor } from './processor/processor.js';
import { server } from './server.js';
import { cronAutoIdleDemo } from './crons/autoIdleDemo.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';
import { envs } from './env.js';
import db from '@nangohq/database';
import { getOtlpRoutes } from '@nangohq/shared';
import { otlp } from '@nangohq/logs';

const logger = getLogger('Jobs');

try {
    const port = envs.NANGO_JOBS_PORT;
    const orchestratorUrl = envs.ORCHESTRATOR_SERVICE_URL;
    const srv = server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const processor = new Processor(orchestratorUrl);

    // We are using a setTimeout because we don't want overlapping setInterval if the DB is down
    let healthCheck: NodeJS.Timeout | undefined;
    const check = async () => {
        try {
            await db.knex.raw('SELECT 1').timeout(1000);
            healthCheck = setTimeout(check, 1000);
        } catch (err) {
            logger.error('HealthCheck failed...', err);
            void close();
        }
    };
    void check();

    const close = async () => {
        logger.info('Closing...');
        clearTimeout(healthCheck);
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
        logger.error('Received unhandledRejection...', reason);
        process.exitCode = 1;
        void close();
    });

    process.on('uncaughtException', (e) => {
        logger.error('Received uncaughtException...', e);
        // not closing on purpose
    });

    processor.start();

    // Register recurring tasks
    cronAutoIdleDemo();
    deleteSyncsData();
    timeoutLogsOperations();

    otlp.register(getOtlpRoutes);
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}

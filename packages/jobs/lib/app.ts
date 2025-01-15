import './tracer.js';
import { Processor } from './processor/processor.js';
import { server } from './server.js';
import { deleteSyncsData } from './crons/deleteSyncsData.js';
import { getLogger, stringifyError, once } from '@nangohq/utils';
import { timeoutLogsOperations } from './crons/timeoutLogsOperations.js';
import { envs } from './env.js';
import db from '@nangohq/database';
import { getOtlpRoutes } from '@nangohq/shared';
import { otlp } from '@nangohq/logs';
import { runnersFleet } from './runner/fleet.js';
import { generateCommitHash } from '@nangohq/fleet';

const logger = getLogger('Jobs');

try {
    const port = envs.NANGO_JOBS_PORT;
    const orchestratorUrl = envs.ORCHESTRATOR_SERVICE_URL;
    const srv = server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const processor = new Processor(orchestratorUrl);

    // We are using a setTimeout because we don't want overlapping setInterval if the DB is down
    let healthCheck: NodeJS.Timeout | undefined;
    let healthCheckFailures = 0;
    const check = async () => {
        const MAX_FAILURES = 5;
        const TIMEOUT = 1000;
        try {
            await db.knex.raw('SELECT 1').timeout(TIMEOUT);
            healthCheckFailures = 0;
            healthCheck = setTimeout(check, TIMEOUT);
        } catch (err) {
            healthCheckFailures += 1;
            logger.error(`HealthCheck failed (${healthCheckFailures} times)...`, err);
            if (healthCheckFailures > MAX_FAILURES) {
                close();
            } else {
                healthCheck = setTimeout(check, TIMEOUT);
            }
        }
    };
    void check();

    const close = once(() => {
        logger.info('Closing...');
        clearTimeout(healthCheck);
        srv.close(async () => {
            processor.stop();
            otlp.stop();
            await runnersFleet.stop();
            await db.knex.destroy();
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

    process.on('unhandledRejection', (reason) => {
        logger.error('Received unhandledRejection...', reason);
        // not closing on purpose
    });

    process.on('uncaughtException', (e) => {
        logger.error('Received uncaughtException...', e);
        // not closing on purpose
    });

    if (envs.RUNNER_TYPE === 'LOCAL') {
        // when running locally, the runners (running as processes) are being killed
        // when the main process is killed and the fleet entries are therefore not associated with any running process
        // we then must fake a new deployment so fleet replaces runners with new ones
        const commitHash = generateCommitHash();
        if (commitHash.isErr()) {
            logger.error(`Unable to generate commit hash`, commitHash.error);
        } else {
            await runnersFleet.rollout(commitHash.value);
        }
    }
    runnersFleet.start();

    processor.start();

    // Register recurring tasks
    deleteSyncsData();
    timeoutLogsOperations();

    otlp.register(getOtlpRoutes);
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}

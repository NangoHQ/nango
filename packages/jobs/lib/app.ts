import './tracer.js';

import db from '@nangohq/database';
import { generateImage } from '@nangohq/fleet';
import { destroy as destroyKvstore } from '@nangohq/kvstore';
import { destroy as destroyLogs, otlp } from '@nangohq/logs';
import { getOtlpRoutes } from '@nangohq/shared';
import { getLogger, initSentry, once, report, stringifyError } from '@nangohq/utils';

import { orchestratorClient } from './clients.js';
import { envs } from './env.js';
import { LambdaInvocationsProcessor } from './invocations/lambda.processor.js';
import { Processor } from './processor/processor.js';
import { getDefaultFleet, startFleets, stopFleets } from './runtime/runtimes.js';
import { server } from './server.js';
import { pubsub } from './utils/pubsub.js';
import { DispatchQueueConsumer } from './webhook/dispatch-queue/consumer.js';

const logger = getLogger('Jobs');

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

try {
    const port = envs.NANGO_JOBS_PORT;
    const orchestratorUrl = envs.ORCHESTRATOR_SERVICE_URL;
    const srv = server.listen(port);
    logger.info(`🚀 service ready at http://localhost:${port}`);
    const processor = new Processor(orchestratorUrl);
    const invocationsProcessor = new LambdaInvocationsProcessor();

    const webhookDispatchConsumer = envs.NANGO_TASK_DISPATCH_QUEUE_URL
        ? new DispatchQueueConsumer({
              queueUrl: envs.NANGO_TASK_DISPATCH_QUEUE_URL,
              orchestratorClient,
              webhookMaxConcurrency: envs.WEBHOOK_ENVIRONMENT_MAX_CONCURRENCY,
              consumerConcurrency: envs.NANGO_TASK_DISPATCH_CONSUMER_CONCURRENCY,
              maxMessages: envs.NANGO_TASK_DISPATCH_MAX_MESSAGES,
              waitTimeSeconds: envs.NANGO_TASK_DISPATCH_WAIT_TIME_SECONDS,
              visibilityTimeoutSeconds: envs.NANGO_TASK_DISPATCH_VISIBILITY_TIMEOUT_SECONDS,
              maxAgeMs: envs.NANGO_TASK_DISPATCH_MAX_AGE_SECONDS * 1000
          })
        : undefined;

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
            report(new Error(`HealthCheck failed (${healthCheckFailures} times)...`, { cause: err }));
            if (healthCheckFailures > MAX_FAILURES) {
                close();
            } else {
                healthCheck = setTimeout(check, TIMEOUT);
            }
        }
    };
    void check();

    const pubsubConnect = await pubsub.connect();
    if (pubsubConnect.isErr()) {
        logger.error(`PubSub: Failed to connect to transport: ${pubsubConnect.error.message}`);
    }

    const close = once(() => {
        logger.info('Closing...');
        clearTimeout(healthCheck);

        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        srv.close(async () => {
            otlp.stop();
            await processor.stop();
            await destroyLogs();
            await stopFleets();
            await db.knex.destroy();
            await db.readOnly.destroy();
            await destroyKvstore();
            await invocationsProcessor.stop();
            if (webhookDispatchConsumer) {
                await webhookDispatchConsumer.stop();
            }

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

    if (envs.RUNNER_TYPE === 'LOCAL') {
        // when running locally, the runners (running as processes) are being killed
        // when the main process is killed and the fleet entries are therefore not associated with any running process
        // we then must fake a new deployment so fleet replaces runners with new ones
        const runnersFleet = getDefaultFleet();
        await runnersFleet.rollout(generateImage(), { verifyImage: false });
    }
    await startFleets();

    processor.start();

    invocationsProcessor.start();

    if (webhookDispatchConsumer) {
        webhookDispatchConsumer.start();
        logger.info('webhook dispatch queue consumer started');
    }

    void otlp.register(getOtlpRoutes);
} catch (err) {
    logger.error(stringifyError(err));
    process.exit(1);
}

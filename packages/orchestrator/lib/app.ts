import './tracer.js';

import { destroy as destroyFeatureFlags, initialize as initializeFeatureFlags } from '@nangohq/feature-flags';
import { DatabaseClient, defaultDatabaseClientOptions, Scheduler } from '@nangohq/scheduler';
import { initSentry, once, report, stringifyError } from '@nangohq/utils';

import { BackpressureMonitor } from './backpressure-monitor.js';
import { envs } from './env.js';
import { TaskEventsHandler } from './events.js';
import { buildSchedulerConfig, handleSchedulerEvent } from './scheduler-config.js';
import { getServer } from './server.js';
import { logger } from './utils.js';

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

const databaseSchema = envs.ORCHESTRATOR_DATABASE_SCHEMA;
const databaseUrl =
    envs.ORCHESTRATOR_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;

try {
    await initializeFeatureFlags();

    const dbClient = new DatabaseClient({
        ...defaultDatabaseClientOptions,
        url: databaseUrl,
        schema: databaseSchema,
        poolMax: envs.ORCHESTRATOR_DB_POOL_MAX,
        ssl: envs.ORCHESTRATOR_DB_SSL ? { rejectUnauthorized: false } : false,
        applicationName: envs.NANGO_DB_APPLICATION_NAME
    });
    await dbClient.migrate();

    const eventsHandler = new TaskEventsHandler(dbClient.db);
    await eventsHandler.connect();

    const scheduler = new Scheduler({
        db: dbClient.db,
        on: eventsHandler.onCallbacks,
        onError: async (err) => {
            report(err);
            logger.error(`Scheduler error: ${stringifyError(err)}`);
            await dbClient.destroy();
            logger.close();

            process.exit(1); // scheduler error is critical, we exit the process
        },
        config: buildSchedulerConfig(envs),
        onEvent: handleSchedulerEvent,
        logger
    });
    scheduler.start();

    const backpressureMonitor = new BackpressureMonitor({
        scheduler,
        tickIntervalMs: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TICK_INTERVAL_MS,
        topN: envs.ORCHESTRATOR_BACKPRESSURE_MONITORING_TOP_N,
        onError: (err) => {
            report(err);
            logger.error(`BackpressureMonitor error: ${stringifyError(err)}`);
        }
    });
    backpressureMonitor.start();

    // default max listener is 10
    // but we need more listeners
    // each processor fetching from a group_key adds a listener for the long-polling dequeue
    eventsHandler.setMaxListeners(Infinity);

    const server = getServer(scheduler, eventsHandler);
    const port = envs.NANGO_ORCHESTRATOR_PORT;
    const api = server.listen(port, () => {
        logger.info(`🚀 Orchestrator API ready at http://localhost:${port}`);
    });

    // --- Close function
    const close = once(() => {
        logger.info('Closing...');
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        api.close(async () => {
            await backpressureMonitor.stop();
            await scheduler.stop();
            await eventsHandler.disconnect();
            await destroyFeatureFlags();
            await dbClient.destroy();

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
} catch (err) {
    logger.error(`Orchestrator API error: ${stringifyError(err)}`);
    process.exit(1);
}

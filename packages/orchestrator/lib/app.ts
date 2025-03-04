import './tracer.js';

import { metrics, once, stringifyError, initSentry, report } from '@nangohq/utils';
import { getServer } from './server.js';
import { envs } from './env.js';
import type { Task } from '@nangohq/scheduler';
import { Scheduler, DatabaseClient, stringifyTask } from '@nangohq/scheduler';
import { EventsHandler } from './events.js';
import { scheduleAbortTask } from './abort.js';
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
    const dbClient = new DatabaseClient({ url: databaseUrl, schema: databaseSchema });
    await dbClient.migrate();

    const eventsHandler = new EventsHandler({
        CREATED: (_scheduler: Scheduler, task: Task) => {
            logger.info(`Task created: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_CREATED);
        },
        STARTED: (_scheduler: Scheduler, task: Task) => {
            logger.info(`Task started: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_STARTED);
        },
        SUCCEEDED: (_scheduler: Scheduler, task: Task) => {
            logger.info(`Task succeeded: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_SUCCEEDED);
        },
        FAILED: (_scheduler: Scheduler, task: Task) => {
            logger.error(`Task failed: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_FAILED);
        },
        EXPIRED: async (scheduler: Scheduler, task: Task) => {
            logger.error(`Task expired: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_EXPIRED);
            await scheduleAbortTask({ scheduler, task });
        },
        CANCELLED: async (scheduler: Scheduler, task: Task) => {
            logger.info(`Task cancelled: ${stringifyTask(task)}`);
            metrics.increment(metrics.Types.ORCH_TASKS_CANCELLED);
            await scheduleAbortTask({ scheduler, task });
        }
    });

    const scheduler = new Scheduler({
        dbClient,
        on: eventsHandler.onCallbacks
    });

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
            scheduler.stop();
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

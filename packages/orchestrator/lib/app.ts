import './tracer.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { getServer } from './server.js';
import { envs } from './env.js';
import type { Task } from '@nangohq/scheduler';
import { Scheduler, DatabaseClient, stringifyTask } from '@nangohq/scheduler';
import { EventsHandler } from './events.js';

const logger = getLogger('Orchestrator');

const databaseSchema = envs.ORCHESTRATOR_DATABASE_SCHEMA;
const databaseUrl =
    envs.ORCHESTRATOR_DATABASE_URL ||
    envs.NANGO_DATABASE_URL ||
    `postgres://${envs.NANGO_DB_USER}:${envs.NANGO_DB_PASSWORD}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;

try {
    const dbClient = new DatabaseClient({ url: databaseUrl, schema: databaseSchema });
    await dbClient.migrate();

    // TODO: add logic to update syncs and syncs jobs in the database
    const eventsHandler = new EventsHandler({
        CREATED: (task: Task) => logger.info(`Task created: ${stringifyTask(task)}`),
        STARTED: (task: Task) => logger.info(`Task started: ${stringifyTask(task)}`),
        SUCCEEDED: (task: Task) => logger.info(`Task succeeded: ${stringifyTask(task)}`),
        FAILED: (task: Task) => logger.error(`Task failed: ${stringifyTask(task)}`),
        EXPIRED: (task: Task) => logger.error(`Task expired: ${stringifyTask(task)}`),
        CANCELLED: (task: Task) => logger.info(`Task cancelled: ${stringifyTask(task)}`)
    });
    const scheduler = new Scheduler({
        dbClient,
        on: eventsHandler.onCallbacks
    });

    // default max listerner is 10
    // but we need more listeners
    // each processor fetching from a group_key adds a listerner for the long-polling dequeue
    eventsHandler.setMaxListeners(Infinity);

    const server = getServer(scheduler, eventsHandler);
    const port = envs.NANGO_ORCHESTRATOR_PORT;
    server.listen(port, () => {
        logger.info(`🚀 Orchestrator API ready at http://localhost:${port}`);
    });

    // handle SIGTERM
    process.on('SIGTERM', () => {
        scheduler.stop();
    });
} catch (err) {
    logger.error(`Orchestrator API error: ${stringifyError(err)}`);
    process.exit(1);
}

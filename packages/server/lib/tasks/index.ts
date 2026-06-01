import { TaskQueue } from '@nangohq/task-queue';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { exampleTask } from './handlers/example.js';

const logger = getLogger('Server.Tasks');

const databaseUrl =
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;

/**
 * Register task types here. To add one: create a handler with `defineTask`, then add it to this
 * tuple — `taskQueue.enqueue` is typed against it automatically.
 */
const definitions = [exampleTask] as const;

/** Enqueue background tasks with `taskQueue.enqueue('type', payload)`. */
export const taskQueue = new TaskQueue({
    definitions,
    dbUrl: databaseUrl,
    dbSchema: envs.TASKS_DATABASE_SCHEMA,
    dbPoolMax: envs.TASKS_DB_POOL_MAX,
    dbSsl: envs.NANGO_DB_SSL,
    applicationName: envs.NANGO_DB_APPLICATION_NAME,
    logger
});

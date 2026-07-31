import { Tasks } from '@nangohq/tasks';
import { getLogger } from '@nangohq/utils';

import { envs } from '../env.js';
import { deleteArtifactsTask } from './handlers/deleteArtifacts.js';
import { deleteFunctionTask } from './handlers/deleteFunction.js';
import { deleteRecordsTask } from './handlers/deleteRecords.js';
import { exampleTask } from './handlers/example.js';

const logger = getLogger('Server.Tasks');

// tests/setup.ts's tasks pre-migration duplicates this URL/schema wiring (it can't import this
// module without constructing the whole Tasks instance) — keep them in sync.
const databaseUrl =
    envs.NANGO_DATABASE_URL ||
    `postgres://${encodeURIComponent(envs.NANGO_DB_USER)}:${encodeURIComponent(envs.NANGO_DB_PASSWORD)}@${envs.NANGO_DB_HOST}:${envs.NANGO_DB_PORT}/${envs.NANGO_DB_NAME}`;

/**
 * Register task types here. To add one: create a handler with `defineTask`, then add it to this
 * tuple — `tasks.enqueue` is typed against it automatically.
 */
const definitions = [exampleTask, deleteFunctionTask, deleteRecordsTask, deleteArtifactsTask] as const;

/** Enqueue background tasks with `tasks.enqueue('type', payload)`. */
export const tasks = new Tasks({
    definitions,
    db: {
        url: databaseUrl,
        schema: envs.TASKS_DATABASE_SCHEMA,
        poolMax: envs.TASKS_DB_POOL_MAX,
        ssl: envs.NANGO_DB_SSL,
        applicationName: envs.NANGO_DB_APPLICATION_NAME
    },
    logger
});

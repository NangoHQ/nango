import './tracer.js';
import { getLogger, stringifyError } from '@nangohq/utils';
import { getServer } from './server.js';
import { envs } from './env.js';
import { Scheduler, DatabaseClient } from '@nangohq/scheduler';

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
    const scheduler = new Scheduler({
        dbClient,
        on: {
            CREATED: (task) => console.log(`Task ${task.id} created`),
            STARTED: (task) => console.log(`Task ${task.id} started`),
            SUCCEEDED: (task) => console.log(`Task ${task.id} succeeded`),
            FAILED: (task) => console.log(`Task ${task.id} failed`),
            EXPIRED: (task) => console.log(`Task ${task.id} expired`),
            CANCELLED: (task) => console.log(`Task ${task.id} cancelled`)
        }
    });

    const port = envs.NANGO_ORCHESTRATOR_PORT;
    const server = getServer({ scheduler });
    server.listen(port, () => {
        logger.info(`🚀 Orchestrator API ready at http://localhost:${port}`);
    });
} catch (err) {
    logger.error(`Orchestrator API error: ${stringifyError(err)}`);
    process.exit(1);
}

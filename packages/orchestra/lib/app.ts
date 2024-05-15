import './tracer.js';
import { getLogger } from '@nangohq/utils';
import { getServer } from './server.js';
import { envs } from './env.js';
import { migrate, Scheduler } from '@nangohq/scheduler';

const logger = getLogger('Orchestra');

try {
    await migrate();

    // TODO: add logic to update syncs and syncs jobs in the database
    const scheduler = new Scheduler({
        on: {
            CREATED: (task) => console.log(`Task ${task.id} created`),
            STARTED: (task) => console.log(`Task ${task.id} started`),
            SUCCEEDED: (task) => console.log(`Task ${task.id} succeeded`),
            FAILED: (task) => console.log(`Task ${task.id} failed`),
            EXPIRED: (task) => console.log(`Task ${task.id} expired`),
            CANCELLED: (task) => console.log(`Task ${task.id} cancelled`)
        }
    });

    const port = envs.NANGO_ORCHESTRA_PORT;
    const server = getServer({ scheduler });
    server.listen(port, () => {
        logger.info(`🚀 Orchestra API ready at http://localhost:${port}`);
    });
} catch (err) {
    console.error(`Orchestra API error: ${err}`);
    process.exit(1);
}

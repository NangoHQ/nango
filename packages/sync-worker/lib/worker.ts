import { Worker } from '@temporalio/worker';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as activities from './activities.js';
import { TASK_QUEUE } from '@nangohq/shared';

async function run() {
    if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
        dotenv.config({ path: '../../.env' });
    }

    const worker = await Worker.create({
        workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
        activities,
        taskQueue: TASK_QUEUE
    });
    // Worker connects to localhost by default and uses console.error for logging.
    // Customize the Worker by passing more options to create():
    // https://typescript.temporal.io/api/classes/worker.Worker
    // If you need to configure server connection parameters, see docs:
    // https://docs.temporal.io/typescript/security#encryption-in-transit-with-mtls

    // Step 2: Start accepting tasks on the `hello-world` queue
    await worker.run();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from '@temporalio/worker';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as activities from './activities.js';
import db from './db/database.js';
//import { syncService } from '@nangohq/nango-server';

export function dirname() {
    return path.dirname(fileURLToPath(import.meta.url));
}

async function run() {
    if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
        dotenv.config({ path: '../../.env' });
    }

    await db.migrate(path.join(dirname(), '../lib/db/migrations'));

    const worker = await Worker.create({
        workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
        activities,
        taskQueue: 'unified_syncs'
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

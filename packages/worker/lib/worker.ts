import { Worker, NativeConnection } from '@temporalio/worker';
import fs from 'fs-extra';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as activities from './activities.js';
import { TASK_QUEUE, isProd } from '@nangohq/shared';

async function run() {
    if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
        dotenv.config({ path: '../../.env' });
    }

    let crt: Buffer | null = null;
    let key: Buffer | null = null;

    const namespace = process.env['TEMPORAL_NAMESPACE'] || 'default';

    if (isProd()) {
        crt = await fs.readFile(`/etc/secrets/${namespace}.crt`);
        key = await fs.readFile(`/etc/secrets/${namespace}.key`);
    }

    const connection = await NativeConnection.connect({
        address: process.env['TEMPORAL_ADDRESS'] || 'localhost:7233',
        tls: !isProd()
            ? false
            : {
                  clientCertPair: {
                      crt: crt as Buffer,
                      key: key as Buffer
                  }
              }
    });

    const worker = await Worker.create({
        connection,
        namespace,
        workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
        activities,
        taskQueue: TASK_QUEUE
    });
    // Worker connects to localhost by default and uses console.error for logging.
    // Customize the Worker by passing more options to create():
    // https://typescript.temporal.io/api/classes/worker.Worker
    // If you need to configure server connection parameters, see docs:
    // https://docs.temporal.io/typescript/security#encryption-in-transit-with-mtls

    // Step 2: Start accepting tasks on the `${TASK_QUEUE}` queue
    await worker.run();
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

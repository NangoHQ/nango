import { Worker, NativeConnection } from '@temporalio/worker';
import fs from 'fs-extra';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as activities from './activities.js';
import { SYNC_TASK_QUEUE, WEBHOOK_TASK_QUEUE, isProd } from '@nangohq/shared';

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

    const syncWorker = {
        connection,
        namespace,
        workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
        activities,
        maxConcurrentWorkflowTaskExecutions: 50,
        taskQueue: SYNC_TASK_QUEUE
    };

    const webhookWorker = {
        connection,
        namespace,
        workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
        activities,
        maxConcurrentWorkflowTaskExecutions: 50,
        maxActivitiesPerSecond: 50,
        taskQueue: WEBHOOK_TASK_QUEUE
    };

    const workers = await Promise.all([Worker.create(syncWorker), Worker.create(webhookWorker)]);
    await Promise.all(workers.map((worker) => worker.run()));
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});

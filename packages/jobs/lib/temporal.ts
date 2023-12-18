import { Worker, NativeConnection } from '@temporalio/worker';
import fs from 'fs-extra';
import * as dotenv from 'dotenv';
import { createRequire } from 'module';
import * as activities from './activities.js';
import { TASK_QUEUE, isProd } from '@nangohq/shared';

export class Temporal {
    namespace: string;
    worker: Worker | null;

    constructor(namespace: string) {
        this.namespace = namespace;
        this.worker = null;
    }

    async start() {
        console.log('Starting Temporal worker');

        if (process.env['SERVER_RUN_MODE'] !== 'DOCKERIZED') {
            dotenv.config({ path: '../../.env' });
        }

        let crt: Buffer | null = null;
        let key: Buffer | null = null;

        if (isProd()) {
            crt = await fs.readFile(`/etc/secrets/${this.namespace}.crt`);
            key = await fs.readFile(`/etc/secrets/${this.namespace}.key`);
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

        this.worker = await Worker.create({
            connection,
            namespace: this.namespace,
            workflowsPath: createRequire(import.meta.url).resolve('./workflows'),
            activities,
            taskQueue: TASK_QUEUE,
            maxConcurrentWorkflowTaskExecutions: 50
        });
        // Worker connects to localhost by default and uses console.error for logging.
        // Customize the Worker by passing more options to create():
        // https://typescript.temporal.io/api/classes/worker.Worker
        // If you need to configure server connection parameters, see docs:
        // https://docs.temporal.io/typescript/security#encryption-in-transit-with-mtls

        await this.worker.run();
    }

    stop() {
        if (this.worker) {
            console.log('Stopping Temporal worker');
            this.worker.shutdown();
        }
    }
}

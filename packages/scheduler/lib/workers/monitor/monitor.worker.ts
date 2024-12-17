import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { stringifyError } from '@nangohq/utils';
import * as tasks from '../../models/tasks.js';
import { setTimeout } from 'node:timers/promises';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';

interface ExpiredTasksMessage {
    ids: string[];
}

export class MonitorWorker {
    private worker: Worker | null;
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        if (isMainThread) {
            const url = new URL('../../../dist/workers/monitor/monitor.worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`Monitor script not found at ${url.href}`);
            }

            this.worker = new Worker(url, { workerData: { url: databaseUrl, schema: databaseSchema } });
            // Throw error if monitor exits with error
            this.worker.on('error', (err) => {
                throw new Error(`Monitor exited with error: ${stringifyError(err)}`);
            });
            // Throw error if monitor exits with non-zero exit code
            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    throw new Error(`Monitor exited with exit code: ${code}`);
                }
            });
        } else {
            throw new Error('MonitorWorker should be instantiated in the main thread');
        }
    }

    start(): void {
        this.worker?.postMessage('start');
    }

    stop(): void {
        if (this.worker) {
            this.worker.postMessage('stop');
            this.worker = null;
        }
    }

    on(callback: (message: ExpiredTasksMessage) => void): void {
        this.worker?.on('message', callback);
    }
}

export class MonitorChild {
    private db: knex.Knex;
    private parent: MessagePort;
    private cancelled: boolean = false;
    private tickIntervalMs = 100;

    constructor(parent: MessagePort, db: knex.Knex) {
        if (isMainThread) {
            throw new Error('Monitor should not be instantiated in the main thread');
        }
        this.db = db;
        this.parent = parent;
        this.parent.on('message', async (msg: 'start' | 'stop') => {
            switch (msg) {
                case 'start':
                    await this.start();
                    break;
                case 'stop':
                    this.stop();
                    break;
            }
        });
    }

    async start(): Promise<void> {
        logger.info('Starting monitor...');
        // eslint-disable-next-line no-constant-condition
        while (!this.cancelled) {
            await this.expires();
            await setTimeout(this.tickIntervalMs);
        }
    }

    stop(): void {
        logger.info('Stopping monitor...');
        this.cancelled = true;
    }

    async expires(): Promise<void> {
        const expired = await tasks.expiresIfTimeout(this.db);
        if (expired.isErr()) {
            logger.error(`Error expiring tasks: ${stringifyError(expired.error)}`);
        } else {
            if (expired.value.length > 0) {
                const taskIds = expired.value.map((t) => t.id);
                if (taskIds.length > 0 && !this.cancelled) {
                    this.parent.postMessage({ ids: taskIds }); // Notifying parent that tasks have expired
                }
                logger.info(`Expired tasks: ${JSON.stringify(expired.value.map((t) => t.id))} `);
            }
        }
    }
}

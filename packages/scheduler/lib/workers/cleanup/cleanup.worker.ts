import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { stringifyError } from '@nangohq/utils';
import * as tasks from '../../models/tasks.js';
import * as schedules from '../../models/schedules.js';
import { setTimeout } from 'node:timers/promises';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';

interface ExpiredTasksMessage {
    ids: string[];
}

export class CleanupWorker {
    private worker: Worker | null;
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        if (isMainThread) {
            const url = new URL('../../../dist/workers/cleanup/cleanup.worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`Cleanup script not found at ${url.href}`);
            }

            this.worker = new Worker(url, { workerData: { url: databaseUrl, schema: databaseSchema } });
            // Throw error if cleanup exits with error
            this.worker.on('error', (err) => {
                throw new Error(`Cleanup exited with error: ${stringifyError(err)}`);
            });
            // Throw error if cleanup exits with non-zero exit code
            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    throw new Error(`Cleanup exited with exit code: ${code}`);
                }
            });
        } else {
            throw new Error('CleanupWorker should be instantiated in the main thread');
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

export class CleanupChild {
    private db: knex.Knex;
    private parent: MessagePort;
    private cancelled: boolean = false;
    private tickIntervalMs = 10_000;

    constructor(parent: MessagePort, db: knex.Knex) {
        if (isMainThread) {
            throw new Error('Cleanup should not be instantiated in the main thread');
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
        logger.info('Starting cleanup...');
        // eslint-disable-next-line no-constant-condition
        while (!this.cancelled) {
            await this.clean();
            await setTimeout(this.tickIntervalMs);
        }
    }

    stop(): void {
        logger.info('Stopping cleanup...');
        this.cancelled = true;
    }

    async clean(): Promise<void> {
        await this.db.transaction(async (trx) => {
            // hard delete schedules where deletedAt is older than 10 days
            const deletedSchedules = await schedules.hardDeleteOlderThanNDays(trx, 10);
            if (deletedSchedules.isErr()) {
                logger.error(deletedSchedules.error);
            } else if (deletedSchedules.value.length > 0) {
                logger.info(`Hard deleted ${deletedSchedules.value.length} schedules`);
            }
            // hard delete terminated tasks older than 10 days unless it is the last task for an active schedule
            const deletedTasks = await tasks.hardDeleteOlderThanNDays(trx, 10);
            if (deletedTasks.isErr()) {
                logger.error(deletedTasks.error);
            } else if (deletedTasks.value.length > 0) {
                logger.info(`Hard deleted ${deletedTasks.value.length} tasks`);
            }
        });
    }
}

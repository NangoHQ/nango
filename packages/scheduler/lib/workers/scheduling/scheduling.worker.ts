import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import { stringifyError } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { dueSchedules } from './scheduling.js';
import * as tasks from '../../models/tasks.js';

interface CreatedTasksMessage {
    ids: string[];
}

export class SchedulingWorker {
    private worker: Worker | null;
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        if (isMainThread) {
            const url = new URL('../../../dist/workers/scheduling/scheduling.worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`Scheduling script not found at ${url}`);
            }

            this.worker = new Worker(url, { workerData: { url: databaseUrl, schema: databaseSchema } });
            // Throw error if worker exits with error
            this.worker.on('error', (err) => {
                throw new Error(`Scheduling exited with error: ${stringifyError(err)}`);
            });
            // Throw error if worker exits with non-zero exit code
            this.worker.on('exit', (code) => {
                if (code !== 0) {
                    throw new Error(`Scheduling exited with exit code: ${code}`);
                }
            });
        } else {
            throw new Error('SchedulingWorker should be instantiated in the main thread');
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

    on(callback: (message: CreatedTasksMessage) => void): void {
        this.worker?.on('message', callback);
    }
}

export class SchedulingChild {
    private db: knex.Knex;
    private parent: MessagePort;
    private cancelled: boolean = false;
    private tickIntervalMs = 100;

    constructor(parent: MessagePort, db: knex.Knex) {
        if (isMainThread) {
            throw new Error('Scheduling should not be instantiated in the main thread');
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
        logger.info('Starting scheduling...');
        // eslint-disable-next-line no-constant-condition
        while (!this.cancelled) {
            await this.schedule();
            await setTimeout(this.tickIntervalMs);
        }
    }

    stop(): void {
        logger.info('Stopping scheduling...');
        this.cancelled = true;
    }

    async schedule(): Promise<void> {
        await this.db.transaction(async (trx) => {
            const schedules = await dueSchedules(trx);
            if (schedules.isErr()) {
                logger.error(`Failed to get due schedules: ${schedules.error}`);
                return;
            }
            const taskIds = [];
            for (const schedule of schedules.value) {
                const task = await tasks.create(trx, {
                    scheduleId: schedule.id,
                    startsAfter: new Date(),
                    name: `${schedule.name}:${new Date().toISOString()}`,
                    payload: schedule.payload,
                    groupKey: schedule.groupKey,
                    retryCount: 0,
                    retryMax: schedule.retryMax,
                    createdToStartedTimeoutSecs: schedule.createdToStartedTimeoutSecs,
                    startedToCompletedTimeoutSecs: schedule.startedToCompletedTimeoutSecs,
                    heartbeatTimeoutSecs: schedule.heartbeatTimeoutSecs
                });
                if (task.isErr()) {
                    logger.error(`Failed to create task for schedule: ${schedule.id}`);
                } else {
                    taskIds.push(task.value.id);
                }
            }
            if (taskIds.length > 0) {
                this.parent.postMessage({ ids: taskIds }); // notifying parent that tasks have been created
            }
        });
    }
}

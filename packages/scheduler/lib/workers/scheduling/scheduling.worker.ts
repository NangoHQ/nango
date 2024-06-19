import * as fs from 'fs';
import type { MessagePort } from 'node:worker_threads';
import { Worker, isMainThread } from 'node:worker_threads';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
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
        const res = await this.db.transaction(async (trx): Promise<Result<string[]>> => {
            const taskIds: string[] = [];
            // Try to acquire a lock to prevent multiple instances from scheduling at the same time
            const res = await trx.raw('SELECT pg_try_advisory_xact_lock(?) AS lock_granted', [5003001106]);
            const lockGranted = res?.rows.length > 0 ? res.rows[0].lock_granted : false;

            if (lockGranted) {
                const schedules = await dueSchedules(trx);
                if (schedules.isErr()) {
                    return Err(`Failed to get due schedules: ${stringifyError(schedules.error)}`);
                } else {
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
                }
            } else {
                await setTimeout(1000); // wait for 1s to prevent retrying too quickly
            }
            return Ok(taskIds);
        });
        if (res.isErr()) {
            logger.error(res.error);
            return;
        }
        // notifying parent (Scheduler) that tasks have been created
        if (res.value.length > 0) {
            this.parent.postMessage({ ids: res.value });
        }
    }
}

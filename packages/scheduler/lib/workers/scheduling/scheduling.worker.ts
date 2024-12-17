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
import * as schedules from '../../models/schedules.js';
import tracer from 'dd-trace';

interface CreatedTasksMessage {
    ids: string[];
}

export class SchedulingWorker {
    private worker: Worker | null;
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        if (isMainThread) {
            const url = new URL('../../../dist/workers/scheduling/scheduling.worker.boot.js', import.meta.url);
            if (!fs.existsSync(url)) {
                throw new Error(`Scheduling script not found at ${url.href}`);
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
            const span = tracer.startSpan('scheduler.scheduling.schedule');

            try {
                // Try to acquire a lock to prevent multiple instances from scheduling at the same time
                const lockSpan = tracer.startSpan('scheduler.scheduling.acquire_lock', { childOf: span });
                const res = await tracer.scope().activate(lockSpan, async () => {
                    return trx.raw<{ rows: { lock_schedule: boolean }[] }>('SELECT pg_try_advisory_xact_lock(?) AS lock_schedule', [5003001106]);
                });
                const lockGranted = res?.rows.length > 0 ? res.rows[0]!.lock_schedule : false;
                lockSpan.finish();

                if (lockGranted) {
                    const dueSchedulesSpan = tracer.startSpan('scheduler.scheduling.due_schedules', { childOf: span });
                    const getDueSchedules = await tracer.scope().activate(dueSchedulesSpan, async () => {
                        return dueSchedules(trx);
                    });
                    dueSchedulesSpan.finish();

                    if (getDueSchedules.isErr()) {
                        return Err(`Failed to get due schedules: ${stringifyError(getDueSchedules.error)}`);
                    } else {
                        const tasksCreationSpan = tracer.startSpan('scheduler.scheduling.tasks_creation', { childOf: span });
                        await tracer.scope().activate(tasksCreationSpan, async () => {
                            const createTasks = getDueSchedules.value.map((schedule) =>
                                tasks.create(trx, {
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
                                })
                            );
                            const res = await Promise.allSettled(createTasks);
                            for (const taskRes of res) {
                                if (taskRes.status === 'rejected') {
                                    logger.error(`Failed to schedule task: ${taskRes.reason}`);
                                } else if (taskRes.value.isErr()) {
                                    logger.error(`Failed to schedule task: ${stringifyError(taskRes.value.error)}`);
                                } else {
                                    const task = taskRes.value.value;
                                    if (task.scheduleId) {
                                        await schedules.update(trx, { id: task.scheduleId, lastScheduledTaskId: task.id });
                                    }
                                    taskIds.push(task.id);
                                }
                            }
                        });
                        tasksCreationSpan.finish();
                    }
                } else {
                    await setTimeout(1000); // wait for 1s to prevent retrying too quickly
                }
                return Ok(taskIds);
            } catch (err) {
                span.setTag('error', err);
                throw err;
            } finally {
                span.finish();
            }
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

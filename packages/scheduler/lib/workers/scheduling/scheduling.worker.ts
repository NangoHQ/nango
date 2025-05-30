import type { MessagePort } from 'node:worker_threads';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import { setTimeout } from 'node:timers/promises';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { dueSchedules } from './scheduling.js';
import * as tasks from '../../models/tasks.js';
import * as schedules from '../../models/schedules.js';
import { SchedulerWorker, SchedulerWorkerChild } from '../worker.js';
import tracer from 'dd-trace';
import { envs } from '../../env.js';

export class SchedulingWorker extends SchedulerWorker {
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        super({
            workerUrl: new URL('../../../dist/workers/scheduling/scheduling.worker.boot.js', import.meta.url),
            name: 'Scheduling',
            databaseUrl: databaseUrl,
            databaseSchema
        });
    }
}

export class SchedulingChild extends SchedulerWorkerChild {
    constructor(parent: MessagePort, db: knex.Knex) {
        super({
            name: 'Scheduling',
            parent,
            db,
            tickIntervalMs: envs.ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS
        });
    }

    async run(): Promise<void> {
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
                            const now = new Date();
                            const createTasks = getDueSchedules.value.map((schedule) =>
                                tasks.create(trx, {
                                    scheduleId: schedule.id,
                                    startsAfter: now,
                                    name: `${schedule.name}:${now.toISOString()}`,
                                    payload: schedule.payload,
                                    groupKey: schedule.groupKey,
                                    groupMaxConcurrency: 0,
                                    retryCount: 0,
                                    retryMax: schedule.retryMax,
                                    createdToStartedTimeoutSecs: schedule.createdToStartedTimeoutSecs,
                                    startedToCompletedTimeoutSecs: schedule.startedToCompletedTimeoutSecs,
                                    heartbeatTimeoutSecs: schedule.heartbeatTimeoutSecs,
                                    ownerKey: null
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

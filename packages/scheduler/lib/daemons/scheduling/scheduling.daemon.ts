import { setTimeout } from 'node:timers/promises';

import tracer from 'dd-trace';

import { stringifyError } from '@nangohq/utils';

import * as schedules from '../../models/schedules.js';
import { SchedulerDaemon } from '../daemon.js';
import { dueSchedules } from './scheduling.js';
import { envs } from '../../env.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';

import type { Task } from '../../types.js';
import type knex from 'knex';

export class SchedulingDaemon extends SchedulerDaemon {
    private readonly onScheduling: (task: Task) => void;

    constructor({
        db,
        abortSignal,
        onScheduling,
        onError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        onScheduling: (task: Task) => void;
        onError: (err: Error) => void;
    }) {
        super({
            name: 'Scheduling',
            db,
            tickIntervalMs: envs.ORCHESTRATOR_SCHEDULING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
        this.onScheduling = onScheduling;
    }

    async run(): Promise<void> {
        return this.db.transaction(async (trx) => {
            try {
                // Try to acquire a lock to prevent multiple instances from scheduling at the same time
                const res = await tracer.trace('scheduler.scheduling.acquire_lock', async () => {
                    return trx.raw<{ rows: { lock_schedule: boolean }[] }>('SELECT pg_try_advisory_xact_lock(?) AS lock_schedule', [5003001106]);
                });
                const lockGranted = res?.rows.length > 0 ? res.rows[0]!.lock_schedule : false;

                if (lockGranted) {
                    await tracer.trace('scheduler.scheduling.schedule_tasks', async () => {
                        const getDueSchedules = await tracer.trace('scheduler.scheduling.due_schedules', async () => {
                            return dueSchedules(trx);
                        });

                        if (getDueSchedules.isErr()) {
                            throw new Error(`Failed to get due schedules: ${stringifyError(getDueSchedules.error)}`);
                        } else {
                            await tracer.trace('scheduler.scheduling.tasks_creation', async () => {
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
                                        this.onScheduling(task);
                                    }
                                }
                            });
                        }
                    });
                } else {
                    await setTimeout(1000); // wait for 1s to prevent retrying too quickly
                }
            } catch (err) {
                logger.error(err);
            }
        });
    }
}

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
                            await tracer.trace('scheduler.scheduling.tasks_creation', async (span) => {
                                const now = new Date();
                                const taskProps = getDueSchedules.value.map((schedule) => ({
                                    scheduleId: schedule.id,
                                    startsAfter: now,
                                    name: `${schedule.name}:${now.toISOString()}`,
                                    payload: schedule.payload,
                                    groupKey: schedule.groupKey,
                                    groupMaxConcurrency: envs.SYNC_ENVIRONMENT_MAX_CONCURRENCY,
                                    retryCount: 0,
                                    retryMax: schedule.retryMax,
                                    createdToStartedTimeoutSecs: schedule.createdToStartedTimeoutSecs,
                                    startedToCompletedTimeoutSecs: schedule.startedToCompletedTimeoutSecs,
                                    heartbeatTimeoutSecs: schedule.heartbeatTimeoutSecs,
                                    ownerKey: null
                                }));
                                const createRes = await tasks.create(trx, taskProps);
                                if (createRes.isErr()) {
                                    throw new Error(`Failed to schedule tasks: ${stringifyError(createRes.error)}`);
                                }
                                if (createRes.value.cappedGroupKeys.length > 0) {
                                    logger.warning(`Capped scheduling tasks for group keys: ${createRes.value.cappedGroupKeys.join(', ')}`);
                                }
                                const scheduleUpdates = [];
                                const scheduledTasks = [];
                                for (const task of createRes.value.tasks) {
                                    if (task.scheduleId) {
                                        scheduleUpdates.push({ id: task.scheduleId, taskId: task.id, taskState: task.state });
                                    }
                                    scheduledTasks.push(task);
                                }

                                // Update the last scheduled task for each schedule
                                const scheduleRes = await schedules.setLastScheduledTask(trx, scheduleUpdates);
                                if (scheduleRes.isErr()) {
                                    logger.error(`Error updating schedules with last scheduled task: ${stringifyError(scheduleRes.error)}`);
                                }

                                span.addTags({
                                    'scheduling.scheduled': scheduledTasks.length
                                });

                                // Notify the listeners about the scheduled tasks
                                scheduledTasks.forEach((task) => this.onScheduling(task));
                            });
                        }
                    });
                } else {
                    await setTimeout(1000); // wait for 1s to prevent retrying too quickly
                }
            } catch (err) {
                logger.error(err);
                throw err;
            }
        });
    }
}

import { setTimeout } from 'node:timers/promises';

import { stringifyError } from '@nangohq/utils';

import * as schedules from '../../models/schedules.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type { Task } from '../../types.js';
import type knex from 'knex';

export class ExpiringDaemon extends SchedulerDaemon {
    private onExpiring: (task: Task) => void;
    private readonly batchSize: number;

    constructor({
        db,
        abortSignal,
        tickIntervalMs,
        batchSize,
        onExpiring,
        onError,
        continueOnError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        tickIntervalMs: number;
        batchSize: number;
        onExpiring: (task: Task) => void;
        onError: (err: Error) => void;
        continueOnError?: boolean;
    }) {
        super({
            name: 'Monitor',
            db,
            tickIntervalMs,
            abortSignal,
            onError,
            continueOnError
        });
        this.onExpiring = onExpiring;
        this.batchSize = batchSize;
    }

    async run(): Promise<void> {
        return this.db.transaction(async (trx) => {
            // Try to acquire a lock to prevent multiple instances from expiring at the same time
            const res = await trx.raw<{ rows: { lock_expire: boolean }[] }>('SELECT pg_try_advisory_xact_lock(?) AS lock_expire', [5003001108]);
            const lockGranted = res?.rows.length > 0 ? res.rows[0]!.lock_expire : false;

            if (lockGranted) {
                const expired = await tasks.expiresIfTimeout(trx, { batchSize: this.batchSize });
                if (expired.isErr()) {
                    logger.error(`Error expiring tasks: ${stringifyError(expired.error)}`);
                    return;
                }
                if (expired.value.length > 0) {
                    // update schedules to reflect the expired tasks
                    const scheduleRes = await schedules.scheduleNextExecution(trx, {
                        taskIds: expired.value.filter((t) => t.scheduleId).map((t) => t.id),
                        taskState: 'EXPIRED'
                    });
                    if (scheduleRes.isErr()) {
                        logger.error(`Error updating schedules for expired tasks: ${stringifyError(scheduleRes.error)}`);
                        return;
                    }
                    for (const task of expired.value) {
                        this.onExpiring(task);
                    }
                }
            } else {
                await setTimeout(1000); // wait for 1s to prevent retrying too quickly
            }
        });
    }
}

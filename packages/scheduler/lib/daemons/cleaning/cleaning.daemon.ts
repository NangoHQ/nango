import { setTimeout } from 'node:timers/promises';

import * as schedules from '../../models/schedules.js';
import * as tasks from '../../models/tasks.js';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';

import type knex from 'knex';

export class CleaningDaemon extends SchedulerDaemon {
    private readonly olderThanDays: number;

    constructor({
        db,
        abortSignal,
        tickIntervalMs,
        olderThanDays,
        onError
    }: {
        db: knex.Knex;
        abortSignal: AbortSignal;
        tickIntervalMs: number;
        olderThanDays: number;
        onError: (err: Error) => void;
    }) {
        super({
            name: 'Cleanup',
            db,
            tickIntervalMs,
            abortSignal,
            onError
        });
        this.olderThanDays = olderThanDays;
    }

    async run(): Promise<void> {
        await this.db.transaction(async (trx) => {
            // Try to acquire a lock to prevent multiple instances from cleaning at the same time
            const res = await trx.raw<{ rows: { lock_clean: boolean }[] }>('SELECT pg_try_advisory_xact_lock(?) AS lock_clean', [5003001107]);
            const lockGranted = res?.rows.length > 0 ? res.rows[0]!.lock_clean : false;

            if (lockGranted) {
                // hard delete schedules where deletedAt is older than N days
                const deletedSchedules = await schedules.hardDeleteOlderThanNDays(trx, this.olderThanDays);
                if (deletedSchedules.isErr()) {
                    logger.error(deletedSchedules.error);
                } else if (deletedSchedules.value.length > 0) {
                    logger.info(`Hard deleted ${deletedSchedules.value.length} schedules`);
                }
                // hard delete terminated tasks older than N days unless it is the last task for an active schedule
                const deletedTasks = await tasks.hardDeleteOlderThanNDays(trx, this.olderThanDays);
                if (deletedTasks.isErr()) {
                    logger.error(deletedTasks.error);
                } else if (deletedTasks.value.length > 0) {
                    logger.info(`Hard deleted ${deletedTasks.value.length} tasks`);
                }
            } else {
                await setTimeout(1000); // wait for 1s to prevent retrying too quickly
            }
        });
    }
}

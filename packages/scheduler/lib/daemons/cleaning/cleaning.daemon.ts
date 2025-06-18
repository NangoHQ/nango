import * as tasks from '../../models/tasks.js';
import * as schedules from '../../models/schedules.js';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { SchedulerDaemon } from '../daemon.js';
import { envs } from '../../env.js';

export class CleaningDaemon extends SchedulerDaemon {
    constructor({ db, abortSignal, onError }: { db: knex.Knex; abortSignal: AbortSignal; onError: (err: Error) => void }) {
        super({
            name: 'Cleanup',
            db,
            tickIntervalMs: envs.ORCHESTRATOR_CLEANING_TICK_INTERVAL_MS,
            abortSignal,
            onError
        });
    }

    async run(): Promise<void> {
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

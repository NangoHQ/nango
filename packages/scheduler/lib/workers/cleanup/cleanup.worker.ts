import type { MessagePort } from 'node:worker_threads';
import * as tasks from '../../models/tasks.js';
import * as groups from '../../models/groups.js';
import * as schedules from '../../models/schedules.js';
import type knex from 'knex';
import { logger } from '../../utils/logger.js';
import { SchedulerWorker, SchedulerWorkerChild } from '../worker.js';
import { envs } from '../../env.js';

export class CleanupWorker extends SchedulerWorker {
    constructor({ databaseUrl, databaseSchema }: { databaseUrl: string; databaseSchema: string }) {
        super({
            workerUrl: new URL('../../../dist/workers/cleanup/cleanup.worker.boot.js', import.meta.url),
            name: 'Cleanup',
            databaseUrl: databaseUrl,
            databaseSchema
        });
    }
}

export class CleanupChild extends SchedulerWorkerChild {
    constructor(parent: MessagePort, db: knex.Knex) {
        super({
            name: 'Cleanup',
            parent,
            db,
            tickIntervalMs: envs.ORCHESTRATOR_CLEANUP_TICK_INTERVAL_MS
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
            // hard delete groups that have not been used in 10 days
            const deletedGroups = await groups.hardDeleteUnused(trx, { ms: 10 * 24 * 60 * 60 * 1000 });
            if (deletedGroups.isErr()) {
                logger.error(deletedGroups.error);
            } else if (deletedGroups.value.length > 0) {
                logger.info(`Hard deleted ${deletedGroups.value.length} groups`);
            }
        });
    }
}

import { Err, Ok, stringifyError } from '@nangohq/utils';

import { defaultSchedulerConfig } from '../../config.js';
import { DbSchedule, SCHEDULES_TABLE } from '../../models/schedules.js';

import type { Schedule } from '../../types.js';
import type { Result } from '@nangohq/utils';
import type knex from 'knex';

export async function dueSchedules(db: knex.Knex, opts: { batchSize?: number } = {}): Promise<Result<Schedule[]>> {
    const batchSize = opts.batchSize ?? defaultSchedulerConfig.limits.schedulingBatchSize;
    try {
        // Bounded per tick so a backlog drains across ticks rather than one transaction holding the scheduling lock.
        const schedules: DbSchedule[] = await db
            .select('*')
            .from(SCHEDULES_TABLE)
            .where('state', 'STARTED')
            .where('starts_at', '<=', db.fn.now())
            .where(function () {
                this.whereNotIn('last_scheduled_task_state', ['CREATED', 'STARTED']).orWhereNull('last_scheduled_task_state');
            })
            .where('next_execution_at', '<=', db.fn.now())
            .orderBy('next_execution_at', 'asc')
            .limit(batchSize)
            .forUpdate()
            .skipLocked();
        return Ok(schedules.map(DbSchedule.from));
    } catch (err) {
        return Err(new Error(`Error getting due schedules: ${stringifyError(err)}`));
    }
}

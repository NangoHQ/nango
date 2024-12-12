import type knex from 'knex';
import type { Schedule } from '../../types.js';
import { DbSchedule, SCHEDULES_TABLE } from '../../models/schedules.js';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function dueSchedules(db: knex.Knex): Promise<Result<Schedule[]>> {
    try {
        const schedules: DbSchedule[] = await db
            .select('s.*')
            .from({ s: SCHEDULES_TABLE })
            .leftJoin(`${TASKS_TABLE} AS t`, 's.last_scheduled_task_id', 't.id')
            .where('s.state', 'STARTED')
            .where('s.starts_at', '<=', db.fn.now())
            .where(function () {
                // schedule has never been run
                this.where('s.last_scheduled_task_id', 'IS', null)
                    // schedule with last task not running and was started before the last due time
                    .orWhere(function () {
                        this.whereNotIn('t.state', ['CREATED', 'STARTED']).andWhere(
                            't.starts_after',
                            '<',
                            db.raw(`s.starts_at + (floor(extract(EPOCH FROM (now() - s.starts_at)) / extract(EPOCH FROM s.frequency)) * s.frequency)`)
                        );
                    });
            })
            .forUpdate('s')
            .skipLocked();
        return Ok(schedules.map(DbSchedule.from));
    } catch (err) {
        console.log(err);
        return Err(new Error(`Error getting due schedules: ${stringifyError(err)}`));
    }
}

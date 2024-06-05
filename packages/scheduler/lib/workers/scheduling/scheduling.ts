import type knex from 'knex';
import type { Schedule } from '../../types.js';
import { DbSchedule, SCHEDULES_TABLE } from '../../models/schedules.js';
import type { Result } from '@nangohq/utils';
import { Err, Ok, stringifyError } from '@nangohq/utils';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function dueSchedules(db: knex.Knex): Promise<Result<Schedule[]>> {
    try {
        const query = db
            .with(
                'last_run_times',
                // calculate the last run time for each schedule that is started/not deleted
                db
                    .select(
                        's.id',
                        db.raw(`
                            s.starts_at + (FLOOR(EXTRACT(EPOCH FROM (NOW() - s.starts_at)) / EXTRACT(EPOCH FROM s.frequency)) * s.frequency) AS last_run_time
                        `)
                    )
                    .from({ s: SCHEDULES_TABLE })
                    .where({ state: 'STARTED' })
                    .whereRaw('s.starts_at <= NOW()')
            )
            .select('*')
            .from<DbSchedule>({ s: SCHEDULES_TABLE })
            .joinRaw('JOIN last_run_times lrt ON s.id = lrt.id')
            // filter out schedules that have a running task
            .whereNotExists(
                db
                    .select('id')
                    .from({ t: TASKS_TABLE })
                    .whereRaw('t.schedule_id = s.id')
                    .where(function () {
                        this.where({ state: 'CREATED' }).orWhere({ state: 'STARTED' });
                    })
            )
            // filter out schedules that have tasks started after the last run time
            .whereNotExists(
                db.select('id').from({ t: TASKS_TABLE }).whereRaw('t.schedule_id = s.id').andWhere('t.starts_after', '>=', db.raw('lrt.last_run_time'))
            );
        const schedules = await query;
        return Ok(schedules.map(DbSchedule.from));
    } catch (err: unknown) {
        console.log(err);
        return Err(new Error(`Error getting due schedules: ${stringifyError(err)}`));
    }
}

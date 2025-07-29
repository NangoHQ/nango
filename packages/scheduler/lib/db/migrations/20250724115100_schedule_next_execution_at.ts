import type { Knex } from 'knex';

import { SCHEDULES_TABLE } from '../../models/schedules.js';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ${SCHEDULES_TABLE}
            ADD COLUMN IF NOT EXISTS last_scheduled_task_state task_states DEFAULT NULL,
            ADD COLUMN IF NOT EXISTS next_execution_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;`
    );

    // Update existing schedules
    // last_scheduled_task_state is read from tasks table
    // if task exists and is SUCCEEDED next_execution_at is next due date calculatd using ceiling()
    // if no task exists or task is not SUCCEEDED, next_execution_at is last due date calculated using floor()
    await knex.raw(
        `WITH task_states AS (
            SELECT
                s.id as schedule_id,
                t.state as last_task_state
            FROM ${SCHEDULES_TABLE} s
            LEFT JOIN ${TASKS_TABLE} t ON s.last_scheduled_task_id = t.id
        )
        UPDATE ${SCHEDULES_TABLE} s
        SET
            last_scheduled_task_state = ts.last_task_state,
            next_execution_at = (
                CASE
                    WHEN ts.last_task_state IS NULL
                    THEN s.starts_at + (floor(extract(EPOCH FROM (now() - s.starts_at)) / extract(EPOCH FROM s.frequency)) * s.frequency)
                    ELSE s.starts_at + (ceiling(extract(EPOCH FROM (now() - s.starts_at)) / extract(EPOCH FROM s.frequency)) * s.frequency)
                END
            )
        FROM task_states ts
        WHERE s.id = ts.schedule_id;`
    );

    // alter next_execution_at to be not null now that it has been populated
    await knex.raw(`ALTER TABLE ${SCHEDULES_TABLE} ALTER COLUMN next_execution_at SET NOT NULL;`);

    // index to optimize the scheduling query
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_scheduling"
            ON ${SCHEDULES_TABLE} (state, last_scheduled_task_state, next_execution_at)
            WHERE state = 'STARTED';`
    );
    // index on last_scheduled_task_id to update last_scheduled_task_state
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_last_scheduled_task_id"
            ON ${SCHEDULES_TABLE} (last_scheduled_task_id)
            WHERE last_scheduled_task_id IS NOT NULL;`
    );
}

export async function down(): Promise<void> {}

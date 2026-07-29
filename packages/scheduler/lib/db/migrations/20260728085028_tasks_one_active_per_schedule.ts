import { TASKS_TABLE } from '../../models/tasks.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // Create a unique index on the tasks table to ensure that only one task can be in the 'CREATED' or 'STARTED' state for a given schedule_id at any time.
    // This prevents multiple active tasks from being created for the same schedule.
    await knex.raw(
        `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS tasks_one_active_per_schedule
        ON ${TASKS_TABLE} (schedule_id)
        WHERE state IN ('CREATED', 'STARTED');`
    );
}

export async function down(_knex: Knex): Promise<void> {}

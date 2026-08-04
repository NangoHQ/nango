import type { Knex } from 'knex';

import { SCHEDULES_TABLE } from '../../models/schedules.js';

export const config = {
    transaction: false
};

// Cover last_scheduled_task_state so dueSchedules resolves it from the index instead of a heap fetch per row.
// Create the new index before dropping the old one to keep a usable index throughout the deploy.
export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedules_ready_for_execution_v2
        ON ${SCHEDULES_TABLE} (next_execution_at, last_scheduled_task_state)
        WHERE state = 'STARTED';`
    );
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_schedules_ready_for_execution";`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedules_ready_for_execution
        ON ${SCHEDULES_TABLE} (next_execution_at)
        WHERE state = 'STARTED';`
    );
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_schedules_ready_for_execution_v2";`);
}

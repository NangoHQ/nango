import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    // Specific indexes to improve performance of the query monitoring for expired tasks
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_created_starts_after" ON ${TASKS_TABLE} USING BTREE (starts_after) WHERE state = 'CREATED';`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_started_last_heartbeat" ON ${TASKS_TABLE} USING BTREE (last_heartbeat_at) WHERE state = 'STARTED';`
    );
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_started_last_state_transition" ON ${TASKS_TABLE} USING BTREE (last_state_transition_at) WHERE state = 'STARTED';`
    );
}

export async function down(): Promise<void> {}

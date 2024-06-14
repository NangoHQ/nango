import type { Knex } from 'knex';
import { SCHEDULES_TABLE } from '../../models/schedules.js';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
            ALTER TABLE ${SCHEDULES_TABLE}
            ADD COLUMN IF NOT EXISTS schedule_id uuid,
            ADD COLUMN IF NOT EXISTS group_key varchar(255) NOT NULL,
            ADD COLUMN IF NOT EXISTS retry_max integer NOT NULL default(0),
            ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL default(0),
            ADD COLUMN IF NOT EXISTS created_to_started_timeout_secs integer NOT NULL,
            ADD COLUMN IF NOT EXISTS started_to_completed_timeout_secs integer NOT NULL,
            ADD COLUMN IF NOT EXISTS heartbeat_timeout_secs integer NOT NULL;
        `);
    // Tasks indexes
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_schedule_id" ON ${TASKS_TABLE} USING BTREE (schedule_id);`);
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_starts_after" ON ${TASKS_TABLE} USING BTREE (starts_after);`);
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_state" ON ${TASKS_TABLE} USING BTREE (state);`);

    // Schedules indexes
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_state_started" ON ${SCHEDULES_TABLE} USING BTREE (state) WHERE state = 'STARTED';`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_schedule_id";`);
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_starts_after";`);
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_state";`);
    await knex.raw(`DROP INDEX IF EXISTS "idx_schedules_state_started";`);
    await knex.raw(`
            ALTER TABLE ${SCHEDULES_TABLE}
            DROP COLUMN IF EXISTS schedule_id,
            DROP COLUMN IF EXISTS group_key,
            DROP COLUMN IF EXISTS retry_max,
            DROP COLUMN IF EXISTS retry_count,
            DROP COLUMN IF EXISTS created_to_started_timeout_secs,
            DROP COLUMN IF EXISTS started_to_completed_timeout_secs,
            DROP COLUMN IF EXISTS heartbeat_timeout_secs;
        `);
}

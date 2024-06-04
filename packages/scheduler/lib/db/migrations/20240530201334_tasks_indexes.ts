import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_group_key_state" ON ${TASKS_TABLE} USING BTREE (group_key, state);`);
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_group_key_created" ON ${TASKS_TABLE} USING BTREE (group_key) WHERE state = 'CREATED';`);
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tasks_group_key_started" ON ${TASKS_TABLE} USING BTREE (group_key) WHERE state = 'STARTED';`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_group_key_state";`);
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_group_key_created";`);
    await knex.raw(`DROP INDEX IF EXISTS "idx_tasks_group_key_started";`);
}

import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `ALTER TABLE ${TASKS_TABLE}
        ADD COLUMN IF NOT EXISTS retry_key UUID,
        ADD COLUMN IF NOT EXISTS owner_key VARCHAR(64);
        `
    );

    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_retry_key ON ${TASKS_TABLE} USING BTREE (retry_key);
    `);
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tasks_owner_key ON ${TASKS_TABLE} USING BTREE (owner_key);
    `);
}

export async function down(): Promise<void> {}

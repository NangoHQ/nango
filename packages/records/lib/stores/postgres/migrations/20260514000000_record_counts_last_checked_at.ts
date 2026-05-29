import type { Knex } from 'knex';

const TABLE = 'record_counts';

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS autodelete_checked_at timestamptz DEFAULT NULL;
    `);
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TABLE}_autodelete_checked_at_idx
        ON "${TABLE}" (autodelete_checked_at ASC NULLS FIRST);
    `);
    // Drop existing redundant index. The same unique index already exists
    await knex.raw(`
        DROP INDEX CONCURRENTLY IF EXISTS ${TABLE}_environment_id_connection_id_model_index;
    `);
}

export async function down(): Promise<void> {}

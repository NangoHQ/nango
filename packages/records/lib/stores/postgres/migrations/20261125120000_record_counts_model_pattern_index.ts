import type { Knex } from 'knex';

const TABLE = 'record_counts';

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS ${TABLE}_model_pattern_idx
        ON "${TABLE}" (model text_pattern_ops);
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS ${TABLE}_model_pattern_idx`);
}

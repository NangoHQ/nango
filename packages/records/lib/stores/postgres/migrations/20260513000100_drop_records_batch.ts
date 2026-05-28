import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS "records_batch"`);
}

export async function down(): Promise<void> {}

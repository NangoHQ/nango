import type { Knex } from 'knex';

const TABLE = 'records';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE "${TABLE}" ADD COLUMN IF NOT EXISTS size_bytes integer DEFAULT NULL`);
}

export async function down(): Promise<void> {}

import type { Knex } from 'knex';

const TABLE = 'record_counts';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            ALTER TABLE "${TABLE}"
            ADD COLUMN IF NOT EXISTS size_bytes bigint NOT NULL DEFAULT 0;
        `);
    });
}

export async function down(_knex: Knex): Promise<void> {}

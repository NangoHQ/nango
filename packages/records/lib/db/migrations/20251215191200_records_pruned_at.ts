import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            ALTER TABLE "records"
            ADD COLUMN IF NOT EXISTS pruned_at timestamp with time zone NULL;
        `);
    });
}

export async function down(): Promise<void> {}

import type { Knex } from 'knex';

const GROUPS_TABLE = 'groups';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${GROUPS_TABLE} CASCADE;`);
}

export async function down(): Promise<void> {}

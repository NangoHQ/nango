import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw('DROP EXTENSION IF NOT EXISTS "uuid-ossp"');
}

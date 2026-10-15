import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(`CREATE TABLE IF NOT EXISTS ??.items (id INT PRIMARY KEY)`, [schema]);
}

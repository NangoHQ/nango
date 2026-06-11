import type { Knex } from 'knex';

const TABLE = 'records_routing';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS "${TABLE}" (
            connection_id integer NOT NULL,
            model character varying(255) NOT NULL,
            store_key character varying(255) NOT NULL DEFAULT 'default',
            created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (connection_id, model)
        )
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS "${TABLE}"`);
}

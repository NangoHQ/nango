import type { Knex } from 'knex';

const TABLE = 'record_counts';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        // TABLE
        await trx.raw(`
            CREATE TABLE "${TABLE}" (
                connection_id integer NOT NULL,
                environment_id integer NOT NULL,
                model character varying(255) NOT NULL,
                object_count integer NOT NULL,
                updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // INDEXES
        await knex.schema.alterTable(TABLE, function (table) {
            table.unique(['environment_id', 'connection_id', 'model']);
            table.index(['environment_id', 'connection_id', 'model']);
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    // TABLE
    // INDEXES are dropped automatically
    await knex.raw(`DROP TABLE IF EXISTS "${TABLE}"`);
}

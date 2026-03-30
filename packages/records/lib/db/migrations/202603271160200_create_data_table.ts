import type { Knex } from 'knex';

const TABLE = 'records_data';
const PARTITION_COUNT = 256;

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        // Moving the records data to a separate table
        // New table is partitioned by connection_id and model to match the records table
        // This allows us to stop writing blob data in the records table and only write data when hash has changed
        await trx.raw(`
            CREATE TABLE IF NOT EXISTS "${TABLE}" (
                id uuid NOT NULL,
                connection_id integer NOT NULL,
                model character varying(255) NOT NULL,
                data jsonb NOT NULL,
                PRIMARY KEY (connection_id, model, id)
            ) PARTITION BY HASH (connection_id, model)
        `);
        for (let i = 0; i < PARTITION_COUNT; i++) {
            await trx.raw(`
                CREATE TABLE "${TABLE}_p${i}" PARTITION OF "${TABLE}"
                FOR VALUES WITH (MODULUS ${PARTITION_COUNT}, REMAINDER ${i});
            `);
        }
    });
    await knex.raw(`ALTER TABLE records ALTER COLUMN json DROP NOT NULL`);
}

export async function down(): Promise<void> {}

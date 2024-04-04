import type { Knex } from 'knex';

const TABLE = 'records';
const PARTITION_COUNT = 256;

function partitionTable(i: number): string {
    return `${TABLE}_p${i}`;
}

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        // TABLE
        await trx.raw(`
            CREATE TABLE "${TABLE}" (
            id uuid NOT NULL,
            external_id character varying(255) NOT NULL,
            json jsonb,
            data_hash character varying(255) NOT NULL,
            connection_id integer NOT NULL,
            model character varying(255) NOT NULL,
            created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at timestamp with time zone,
            sync_id uuid,
            sync_job_id integer,
            CONSTRAINT ${TABLE}_connection_id_external_id_model UNIQUE (connection_id, external_id, model)
            ) PARTITION BY HASH (connection_id, model)
        `);
        for (let i = 0; i < PARTITION_COUNT; i++) {
            await trx.raw(`
                CREATE TABLE "${partitionTable(i)}" PARTITION OF "${TABLE}"
                FOR VALUES WITH (MODULUS ${PARTITION_COUNT}, REMAINDER ${i});
            `);
        }
        // TRIGGERS
        await trx.raw(`
             CREATE OR REPLACE FUNCTION ${TABLE}_undelete()
             RETURNS TRIGGER AS $$
             BEGIN
                 IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
                     NEW.created_at = NOW();
                     NEW.updated_at = NOW();
                 END IF;
                 RETURN NEW;
             END;
             $$ LANGUAGE plpgsql;
        `);
        await trx.raw(`
                     CREATE TRIGGER ${TABLE}_undelete_trigger
                     BEFORE UPDATE ON ${TABLE}
                     FOR EACH ROW
                     EXECUTE FUNCTION ${TABLE}_undelete();
        `);
        await knex.raw(`
            CREATE OR REPLACE FUNCTION ${TABLE}_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                IF OLD.data_hash IS DISTINCT FROM NEW.data_hash THEN
                    NEW.updated_at = NOW();
                END IF;

                RETURN NEW;
            END;
          $$ LANGUAGE plpgsql;
        `);
        await knex.raw(`
            CREATE TRIGGER ${TABLE}_updated_at_trigger
            BEFORE UPDATE ON ${TABLE}
            FOR EACH ROW
            EXECUTE FUNCTION ${TABLE}_updated_at();
        `);
        // INDEXES
        await knex.schema.alterTable(TABLE, function (table) {
            table.index(['connection_id', 'model', 'external_id']);
            table.index(['connection_id', 'model', 'updated_at', 'id']);
            table.index('sync_id');
            table.index('sync_job_id');
            table.unique(['connection_id', 'model', 'id']);
        });
    });
}

export async function down(knex: Knex): Promise<void> {
    // TABLE
    // INDEXES are dropped automatically
    await knex.raw(`DROP TABLE IF EXISTS "${TABLE}"`);
    for (let i = 0; i < PARTITION_COUNT; i++) {
        await knex.raw(`DROP TABLE IF EXISTS "${partitionTable(i)}"`);
    }
    // TRIGGERS
    await knex.raw(`DROP TRIGGER IF EXISTS ${TABLE}_undelete_trigger ON ${TABLE};`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${TABLE}_undelete();`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${TABLE}_updated_at_trigger ON ${TABLE};`);
    await knex.raw(`DROP FUNCTION IF EXISTS ${TABLE}_updated_at();`);
}

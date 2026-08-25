import type { Knex } from 'knex';

const TABLE = 'records_batch';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS "${TABLE}" (
            id             bigserial    PRIMARY KEY,
            connection_id  integer      NOT NULL,
            model          varchar(255) NOT NULL,
            sync_job_id    integer      NOT NULL,
            record_ids     uuid[]       NOT NULL,
            created_at     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await knex.raw(`CREATE INDEX IF NOT EXISTS records_batch_connection_model_job ON "${TABLE}" (connection_id, model, sync_job_id)`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS records_batch_created_at ON "${TABLE}" (created_at)`);
}

export async function down(): Promise<void> {}

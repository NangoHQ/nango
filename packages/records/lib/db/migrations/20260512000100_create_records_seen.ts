import type { Knex } from 'knex';

import { ensureSeenPartition } from '../../models/records.js';

const TABLE = 'records_seen';

export const config = { transaction: false };

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS "${TABLE}" (
            id             bigserial    NOT NULL,
            connection_id  integer      NOT NULL,
            model          varchar(255) NOT NULL,
            sync_job_id    integer      NOT NULL,
            record_ids     uuid[]       NOT NULL,
            created_at     timestamptz  NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id, created_at)
        ) PARTITION BY RANGE (created_at)
    `);
    await knex.raw(`CREATE INDEX IF NOT EXISTS records_seen_connection_model_job ON "${TABLE}" (connection_id, model, sync_job_id)`);

    const res = await ensureSeenPartition({ date: new Date() });
    if (res.isErr()) {
        throw res.error;
    }
}

export async function down(): Promise<void> {}

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import type { Knex } from 'knex';

dayjs.extend(utc);

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

    const day = dayjs().utc().startOf('day');
    const suffix = day.format('YYYYMMDD');
    const next = day.add(1, 'day');
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS "${TABLE}_${suffix}" PARTITION OF "${TABLE}" FOR VALUES FROM ('${day.toISOString()}') TO ('${next.toISOString()}')`
    );
}

export async function down(): Promise<void> {}

import { HOSTED_TELEMETRY_UPLOADS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            day               DATE        NOT NULL,
            metric            TEXT        NOT NULL,
            status            TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
            cursor_ts         TIMESTAMPTZ,
            cursor_attributes JSONB,
            PRIMARY KEY (day, metric)
        )`,
        [schema, HOSTED_TELEMETRY_UPLOADS_TABLE]
    );
}

import { USAGE_TELEMETRY_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            ts         TIMESTAMPTZ      NOT NULL,
            value      DOUBLE PRECISION NOT NULL CHECK (value NOT IN ('NaN', 'Infinity', '-Infinity')),
            metric     TEXT             NOT NULL,
            attributes JSONB            NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
            UNIQUE (metric, ts, attributes)
        ) PARTITION BY RANGE (ts)`,
        [schema, USAGE_TELEMETRY_TABLE]
    );
}

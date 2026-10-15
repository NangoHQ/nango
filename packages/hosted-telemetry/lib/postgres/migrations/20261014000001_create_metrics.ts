import { USAGE_TELEMETRY_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            ts         TIMESTAMPTZ      NOT NULL,
            value      DOUBLE PRECISION NOT NULL CHECK (value NOT IN ('NaN', 'Infinity', '-Infinity')),
            metric     TEXT             NOT NULL,
            attributes JSONB            NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
            -- Attributes are part of the key, and a btree entry cannot exceed ~2.7 KB: bound them well below it.
            CONSTRAINT metrics_attributes_size CHECK (octet_length(attributes::text) <= 1024),
            PRIMARY KEY (metric, ts, attributes)
        ) PARTITION BY RANGE (ts)`,
        [schema, USAGE_TELEMETRY_TABLE]
    );

    // Reads across all metrics over a time range cannot use the primary key, which starts from a metric. Rows
    // arrive in ts order, so a BRIN index narrows such a read to the window's block ranges for a few kB.
    await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ??.?? USING brin (ts)`, [`${USAGE_TELEMETRY_TABLE}_ts_brin_idx`, schema, USAGE_TELEMETRY_TABLE]);
}

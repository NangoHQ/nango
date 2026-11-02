import { HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES, HOSTED_TELEMETRY_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            ts         TIMESTAMPTZ      NOT NULL,
            value      DOUBLE PRECISION NOT NULL CHECK (value NOT IN ('NaN', 'Infinity', '-Infinity')),
            metric     TEXT             NOT NULL,
            attributes JSONB            NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(attributes) = 'object'),
            CONSTRAINT metrics_attributes_size CHECK (octet_length(attributes::text) <= ${HOSTED_TELEMETRY_ATTRIBUTES_MAX_BYTES}),
            PRIMARY KEY (metric, ts, attributes)
        ) PARTITION BY RANGE (ts)`,
        [schema, HOSTED_TELEMETRY_TABLE]
    );

    // Reads across all metrics over a time range cannot use the primary key, which starts from a metric. Rows
    // arrive in ts order, so a BRIN index narrows such a read to the window's block ranges for a few kB.
    await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ??.?? USING brin (ts)`, [`${HOSTED_TELEMETRY_TABLE}_ts_brin_idx`, schema, HOSTED_TELEMETRY_TABLE]);
}

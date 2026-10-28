import { CUSTOMERS_TABLE, INSTALLATIONS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            id           INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            uuid         UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
            customer_id  INTEGER NOT NULL REFERENCES ??.??(id) ON DELETE CASCADE,
            name         TEXT NOT NULL,
            mode         TEXT NOT NULL CHECK (mode IN ('byoc', 'self_managed')),
            stage        TEXT NOT NULL CHECK (stage IN ('production', 'staging', 'development')),
            telemetry    BOOLEAN NOT NULL DEFAULT true,
            alerts       TEXT NOT NULL DEFAULT 'off' CHECK (alerts IN ('off', 'slack', 'oncall')),
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at   TIMESTAMPTZ,
            last_seen_at TIMESTAMPTZ
        )`,
        [schema, INSTALLATIONS_TABLE, schema, CUSTOMERS_TABLE]
    );
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ??.?? (customer_id, name) WHERE deleted_at IS NULL`, [
        `${INSTALLATIONS_TABLE}_customer_id_name_idx`,
        schema,
        INSTALLATIONS_TABLE
    ]);
}

import { CUSTOMERS_TABLE, INSTALLATIONS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            id                    SERIAL PRIMARY KEY,
            uuid                  UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
            customer_id           INTEGER NOT NULL REFERENCES ??.??(id) ON DELETE CASCADE,
            name                  TEXT NOT NULL,
            mode                  TEXT NOT NULL CHECK (mode IN ('byoc', 'self_managed')),
            created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
            tokens_revoked_before TIMESTAMPTZ,
            disabled_at           TIMESTAMPTZ,
            last_seen_at          TIMESTAMPTZ
        )`,
        [schema, INSTALLATIONS_TABLE, schema, CUSTOMERS_TABLE]
    );
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ??.?? (customer_id, name)`, [
        `${INSTALLATIONS_TABLE}_customer_id_name_idx`,
        schema,
        INSTALLATIONS_TABLE
    ]);
}

import { CUSTOMERS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            id         SERIAL PRIMARY KEY,
            name       TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at TIMESTAMPTZ
        )`,
        [schema, CUSTOMERS_TABLE]
    );
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ??.?? (name) WHERE deleted_at IS NULL`, [`${CUSTOMERS_TABLE}_name_idx`, schema, CUSTOMERS_TABLE]);
}

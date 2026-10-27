import { INSTALLATION_KEYS_TABLE, INSTALLATIONS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            installation_id INTEGER NOT NULL REFERENCES ??.??(id) ON DELETE CASCADE,
            kid             TEXT NOT NULL UNIQUE,
            public_key      TEXT NOT NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            deleted_at      TIMESTAMPTZ
        )`,
        [schema, INSTALLATION_KEYS_TABLE, schema, INSTALLATIONS_TABLE]
    );
    await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ??.?? (installation_id) WHERE deleted_at IS NULL`, [
        `${INSTALLATION_KEYS_TABLE}_installation_id_idx`,
        schema,
        INSTALLATION_KEYS_TABLE
    ]);
}

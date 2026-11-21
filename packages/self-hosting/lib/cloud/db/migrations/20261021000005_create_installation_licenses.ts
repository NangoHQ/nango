import { INSTALLATION_LICENSES_TABLE, INSTALLATIONS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(
        `CREATE TABLE IF NOT EXISTS ??.?? (
            id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            installation_id INTEGER NOT NULL REFERENCES ??.??(id) ON DELETE CASCADE,
            issued_at       TIMESTAMPTZ NOT NULL,
            expires_at      TIMESTAMPTZ NOT NULL,
            grace_until     TIMESTAMPTZ NOT NULL,
            license         TEXT NOT NULL,
            signature       TEXT NOT NULL,
            signing_kid     TEXT NOT NULL,
            active          BOOLEAN NOT NULL DEFAULT true,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )`,
        [schema, INSTALLATION_LICENSES_TABLE, schema, INSTALLATIONS_TABLE]
    );
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS ?? ON ??.?? (installation_id) WHERE active`, [
        `${INSTALLATION_LICENSES_TABLE}_active_idx`,
        schema,
        INSTALLATION_LICENSES_TABLE
    ]);
    await knex.raw(`CREATE INDEX IF NOT EXISTS ?? ON ??.?? (installation_id)`, [
        `${INSTALLATION_LICENSES_TABLE}_installation_id_idx`,
        schema,
        INSTALLATION_LICENSES_TABLE
    ]);
}

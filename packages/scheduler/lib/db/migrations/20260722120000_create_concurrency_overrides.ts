import { CONCURRENCY_OVERRIDES_TABLE } from '../../models/concurrencyOverrides.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS ${CONCURRENCY_OVERRIDES_TABLE} (
            group_key       VARCHAR(255) PRIMARY KEY,
            max_concurrency INT NOT NULL CHECK (max_concurrency >= 0),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${CONCURRENCY_OVERRIDES_TABLE}`);
}

import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS private_keys_entity_uuid_idx
            ON ${PRIVATE_KEYS_TABLE} (entity_type, entity_uuid)
            WHERE entity_uuid IS NOT NULL;
    `);
}

export async function down(): Promise<void> {}

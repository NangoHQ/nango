import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${PRIVATE_KEYS_TABLE}
        ADD CONSTRAINT private_keys_entity_ref_check
        CHECK ((entity_id IS NULL) <> (entity_uuid IS NULL));
    `);
}

export async function down(): Promise<void> {}

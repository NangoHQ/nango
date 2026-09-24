import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${PRIVATE_KEYS_TABLE}
        ADD CONSTRAINT private_keys_entity_ref_check
        CHECK (
            CASE WHEN entity_type = 'agent_session'
                THEN entity_id IS NULL AND entity_uuid IS NOT NULL
                ELSE entity_id IS NOT NULL AND entity_uuid IS NULL
            END
        );
    `);
}

export async function down(): Promise<void> {}

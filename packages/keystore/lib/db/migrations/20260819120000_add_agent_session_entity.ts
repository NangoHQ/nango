import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TYPE private_key_entity_types ADD VALUE IF NOT EXISTS 'agent_session';`);
    await knex.raw(`ALTER TABLE ${PRIVATE_KEYS_TABLE} ALTER COLUMN entity_id DROP NOT NULL;`);
    await knex.raw(`ALTER TABLE ${PRIVATE_KEYS_TABLE} ADD COLUMN IF NOT EXISTS entity_uuid UUID;`);
}

export async function down(): Promise<void> {
    // Postgres cannot remove enum values, and restoring NOT NULL would fail once agent_session keys exist.
}

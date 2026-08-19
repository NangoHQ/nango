import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TYPE private_key_entity_types ADD VALUE IF NOT EXISTS 'agent_session';`);
    await knex.raw(`ALTER TABLE ${PRIVATE_KEYS_TABLE} ALTER COLUMN entity_id DROP NOT NULL;`);
    await knex.raw(`ALTER TABLE ${PRIVATE_KEYS_TABLE} ADD COLUMN IF NOT EXISTS entity_uuid UUID;`);
    // NOT VALID then VALIDATE so existing rows are checked without blocking writes.
    await knex.raw(`
        DO $$ BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_constraint
                WHERE conname = 'private_keys_entity_ref_check' AND conrelid = '${PRIVATE_KEYS_TABLE}'::regclass
            ) THEN
                ALTER TABLE ${PRIVATE_KEYS_TABLE} ADD CONSTRAINT private_keys_entity_ref_check
                    CHECK ((entity_id IS NULL) <> (entity_uuid IS NULL)) NOT VALID;
            END IF;
        END $$;
    `);
    await knex.raw(`ALTER TABLE ${PRIVATE_KEYS_TABLE} VALIDATE CONSTRAINT private_keys_entity_ref_check;`);
}

export async function down(): Promise<void> {}

import { INSTALLATION_KEYS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(`ALTER TABLE ??.?? ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ`, [schema, INSTALLATION_KEYS_TABLE]);
}

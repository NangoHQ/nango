import { HOSTED_TELEMETRY_UPLOADS_TABLE } from '../schema.js';

import type { Knex } from 'knex';

export async function up(knex: Knex, schema: string): Promise<void> {
    await knex.raw(`ALTER TABLE ??.?? ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ`, [schema, HOSTED_TELEMETRY_UPLOADS_TABLE]);
}

import { GROUP_OVERRIDES_TABLE } from '../../models/groupOverrides.js';

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${GROUP_OVERRIDES_TABLE}
            ADD COLUMN IF NOT EXISTS rate_limit_per_min INT CHECK (rate_limit_per_min > 0)
    `);
}

export async function down(): Promise<void> {}

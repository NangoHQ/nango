import { GROUP_OVERRIDES_TABLE } from '../../models/groupOverrides.js';

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${GROUP_OVERRIDES_TABLE}
            ALTER COLUMN max_concurrency DROP NOT NULL,
            ADD COLUMN IF NOT EXISTS task_cap INT CHECK (task_cap > 0)
    `);
}

export async function down(): Promise<void> {}

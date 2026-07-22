import { SCHEDULES_TABLE } from '../../models/schedules.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${SCHEDULES_TABLE} ADD COLUMN IF NOT EXISTS group_max_concurrency INT NOT NULL DEFAULT 0 CHECK (group_max_concurrency >= 0)`);
}

export async function down(): Promise<void> {}

import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${TASKS_TABLE} ADD COLUMN IF NOT EXISTS group_max_concurrency INT NOT NULL DEFAULT 0`);
}

export async function down(): Promise<void> {}

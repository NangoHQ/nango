import type { Knex } from 'knex';
import { SCHEDULES_TABLE } from '../../models/schedules.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SCHEDULES_TABLE}
        DROP COLUMN IF EXISTS retry_count;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SCHEDULES_TABLE}
        ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL default(0);
    `);
}

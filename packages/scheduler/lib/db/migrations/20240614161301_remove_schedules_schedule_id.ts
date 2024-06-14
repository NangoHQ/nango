import type { Knex } from 'knex';
import { SCHEDULES_TABLE } from '../../models/schedules.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SCHEDULES_TABLE}
        DROP COLUMN IF EXISTS schedule_id;
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${SCHEDULES_TABLE}
        ADD COLUMN IF NOT EXISTS schedule_id integer uuid;
    `);
}

import type { Knex } from 'knex';
import { SCHEDULES_TABLE } from '../../models/schedules.js';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
            ALTER TABLE ${SCHEDULES_TABLE}
            ADD CONSTRAINT tasks_unique_name UNIQUE (name);
        `);
    await knex.raw(`
            ALTER TABLE ${TASKS_TABLE}
            ADD CONSTRAINT schedules_unique_name UNIQUE (name);
        `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
            ALTER TABLE ${SCHEDULES_TABLE}
            DROP CONSTRAINT schedules_unique_name;
        `);
    await knex.raw(`
            ALTER TABLE ${TASKS_TABLE}
            DROP CONSTRAINT tasks_unique_name;
        `);
}

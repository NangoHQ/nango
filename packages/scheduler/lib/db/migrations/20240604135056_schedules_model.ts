import type { Knex } from 'knex';
import { SCHEDULES_TABLE } from '../../models/schedules.js';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TYPE schedule_states AS ENUM (
                'PAUSED',
                'STARTED',
                'DELETED'
            );
        `);
        await trx.raw(`
            CREATE TABLE IF NOT EXISTS ${SCHEDULES_TABLE} (
                id uuid PRIMARY KEY,
                name varchar(255) NOT NULL,
                state schedule_states NOT NULL,
                starts_at timestamp with time zone NOT NULL,
                frequency interval NOT NULL,
                payload json NOT NULL,
                created_at timestamp with time zone NOT NULL,
                updated_at timestamp with time zone NOT NULL,
                deleted_at timestamp with time zone NULL
            );
        `);
        // add foreign key schedule_id to tasks_table, cascade delete and nullable
        await trx.raw(`
            ALTER TABLE ${TASKS_TABLE}
            ADD COLUMN IF NOT EXISTS schedule_id uuid REFERENCES ${SCHEDULES_TABLE}(id) ON DELETE CASCADE;
        `);
        // TODO: add indexes
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${SCHEDULES_TABLE}`);
    await knex.raw(`DROP TYPE IF EXISTS schedule_states`);
}

import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TYPE task_states AS ENUM (
                'CREATED',
                'STARTED',
                'SUCCEEDED',
                'FAILED',
                'EXPIRED',
                'CANCELLED'
            );
        `);
        await trx.raw(`
            CREATE TABLE ${TASKS_TABLE} (
                id uuid PRIMARY KEY,
                name varchar(255) NOT NULL,
                payload json NOT NULL,
                group_key varchar(255) NOT NULL,
                retry_max integer NOT NULL default(0),
                retry_count integer NOT NULL default(0),
                starts_after timestamp with time zone NOT NULL,
                created_to_started_timeout_secs integer NOT NULL,
                started_to_completed_timeout_secs integer NOT NULL,
                heartbeat_timeout_secs integer NOT NULL,
                created_at timestamp with time zone NOT NULL,
                state task_states NOT NULL,
                last_state_transition_at timestamp with time zone NOT NULL,
                last_heartbeat_at timestamp with time zone NOT NULL,
                output json NULL,
                terminated boolean
            );
        `);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${TASKS_TABLE}`);
    await knex.raw(`DROP TYPE IF EXISTS task_states`);
}

import type { Knex } from 'knex';
import { GROUPS_TABLE } from '../../models/tasks.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
            CREATE TABLE IF NOT EXISTS ${GROUPS_TABLE} (
                key varchar(255) PRIMARY KEY,
                max_concurrency integer NOT NULL,
                created_at timestamp with time zone NOT NULL,
                last_modified_at timestamp with time zone NOT NULL,
                deleted_at timestamp with time zone NULL,
                last_task_added_at timestamp with time zone NULL
            );
        `);
}

export async function down(): Promise<void> {}

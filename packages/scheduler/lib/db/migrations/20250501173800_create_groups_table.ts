import type { Knex } from 'knex';
import { GROUPS_TABLE } from '../../models/groups.js';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TABLE IF NOT EXISTS ${GROUPS_TABLE} (
                key varchar(255) PRIMARY KEY,
                max_concurrency integer NOT NULL,
                created_at timestamp with time zone NOT NULL,
                updated_at timestamp with time zone NOT NULL,
                deleted_at timestamp with time zone NULL,
                last_task_added_at timestamp with time zone NULL
            );
        `);
        await trx.raw(`
            CREATE INDEX IF NOT EXISTS idx_groups_last_task_added_at ON ${GROUPS_TABLE} (last_task_added_at);
        `);
        await trx.raw(`
            CREATE INDEX IF NOT EXISTS idx_groups_updated_at ON ${GROUPS_TABLE} (updated_at);
        `);

        // Insert existing groups (webhook, action, sync and on-event)
        // with max_concurrency 0 (aka: unlimited)
        await trx.raw(`
            INSERT INTO ${GROUPS_TABLE} (key, max_concurrency, created_at, updated_at)
            VALUES ('webhook', 0, NOW(), NOW()),
                   ('action', 0, NOW(), NOW()),
                   ('sync', 0, NOW(), NOW()),
                   ('on-event', 0, NOW(), NOW())
            ON CONFLICT (key) DO NOTHING
        `);
    });
}

export async function down(): Promise<void> {}

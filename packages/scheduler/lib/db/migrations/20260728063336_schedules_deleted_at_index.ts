import { SCHEDULES_TABLE } from '../../models/schedules.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_deleted_at"
        ON ${SCHEDULES_TABLE} (deleted_at)
        WHERE deleted_at IS NOT NULL;`
    );
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS "idx_schedules_deleted_at";`);
}

import { SCHEDULES_TABLE } from '../../models/schedules.js';

import type { Knex } from 'knex';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_soft_deleted_id"
        ON ${SCHEDULES_TABLE} USING BTREE (id)
        WHERE deleted_at IS NOT NULL;`
    );
}

export async function down(): Promise<void> {}

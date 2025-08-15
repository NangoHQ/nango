import type { Knex } from 'knex';

import { SCHEDULES_TABLE } from '../../models/schedules.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX IF EXISTS "idx_schedules_scheduling";`);
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedules_ready_for_execution
        ON ${SCHEDULES_TABLE} (next_execution_at)
        WHERE state = 'STARTED';`
    );
}

export async function down(): Promise<void> {}

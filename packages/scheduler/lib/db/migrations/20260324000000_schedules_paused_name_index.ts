import type { Knex } from 'knex';

import { SCHEDULES_TABLE } from '../../models/schedules.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_schedules_paused_name" ON ${SCHEDULES_TABLE} (name) WHERE state = 'PAUSED';`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_schedules_paused_name";`);
}

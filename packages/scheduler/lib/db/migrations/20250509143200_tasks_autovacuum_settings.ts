import type { Knex } from 'knex';
import { TASKS_TABLE } from '../../models/tasks.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
            ALTER TABLE ${TASKS_TABLE} SET (
                autovacuum_vacuum_scale_factor = 0.01,        -- reducing from 10% to 1%
                autovacuum_analyze_scale_factor = 0.01,       -- reducing from 5% to 1%
                autovacuum_vacuum_insert_scale_factor = 0.05  -- reducing from 20% to 5%
            );
        `);
}

export async function down(): Promise<void> {}

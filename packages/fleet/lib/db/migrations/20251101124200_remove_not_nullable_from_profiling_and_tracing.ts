import type { Knex } from 'knex';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} 
        ALTER COLUMN is_tracing_enabled DROP NOT NULL,
        ALTER COLUMN is_profiling_enabled DROP NOT NULL
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} 
        ALTER COLUMN is_tracing_enabled SET NOT NULL,
        ALTER COLUMN is_profiling_enabled SET NOT NULL
    `);
}

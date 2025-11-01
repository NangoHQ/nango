import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE} ADD COLUMN is_tracing_enabled boolean NOT NULL DEFAULT false`);
    await knex.raw(`ALTER TABLE ${NODES_TABLE} ADD COLUMN is_profiling_enabled boolean NOT NULL DEFAULT false`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} ADD COLUMN is_tracing_enabled boolean NOT NULL DEFAULT false`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} ADD COLUMN is_profiling_enabled boolean NOT NULL DEFAULT false`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE} DROP COLUMN is_tracing_enabled`);
    await knex.raw(`ALTER TABLE ${NODES_TABLE} DROP COLUMN is_profiling_enabled`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} DROP COLUMN is_tracing_enabled`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE} DROP COLUMN is_profiling_enabled`);
}

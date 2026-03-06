import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.schema.alterTable(NODES_TABLE, (table) => {
        table.integer('replicas').notNullable().defaultTo(1);
    });
    await knex.schema.alterTable(NODE_CONFIG_OVERRIDES_TABLE, (table) => {
        table.integer('replicas').nullable().defaultTo(null);
    });
}

export async function down(_knex: Knex): Promise<void> {}

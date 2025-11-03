import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE}
      ADD COLUMN IF NOT EXISTS idle_timeout_secs int NOT NULL DEFAULT 1800`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE}
      ADD COLUMN IF NOT EXISTS idle_timeout_secs int DEFAULT NULL`);
}

export async function down(): Promise<void> {}

import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE}
      ADD COLUMN IF NOT EXISTS idle_max_duration_ms int NOT NULL DEFAULT 1800000`); // 30 minutes
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE}
      ADD COLUMN IF NOT EXISTS idle_max_duration_ms int DEFAULT NULL`); // 30 minutes
}

export async function down(): Promise<void> {}

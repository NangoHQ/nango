import type { Knex } from 'knex';

import { NODES_TABLE } from '../../models/nodes.js';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE}
      ADD COLUMN IF NOT EXISTS isolation_mode varchar(32) DEFAULT 'sandbox'`);
    await knex.raw(`ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE}
      ADD COLUMN IF NOT EXISTS isolation_mode varchar(32) DEFAULT NULL`);
}

export async function down(): Promise<void> {}

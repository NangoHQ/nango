import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${NODES_TABLE}
      ADD COLUMN IF NOT EXISTS fleet_id varchar(255) DEFAULT NULL`);
}

export async function down(): Promise<void> {}

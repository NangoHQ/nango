import type { Knex } from 'knex';
import { DEPLOYMENTS_TABLE } from '../../models/deployments.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`ALTER TABLE ${DEPLOYMENTS_TABLE} DROP COLUMN commit_id`);
}

export async function down(): Promise<void> {}

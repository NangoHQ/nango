import type { Knex } from 'knex';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';
import { DEPLOYMENTS_TABLE } from '../../models/deployments.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TABLE ${DEPLOYMENTS_TABLE}
        ADD COLUMN IF NOT EXISTS "image" character varying(255)
        DEFAULT 'nangohq/nango-runner:production'
    `);
    await knex.raw(`
        UPDATE ${DEPLOYMENTS_TABLE}
        SET image = CONCAT('nangohq/nango-runner:', commit_id)
    `);
    await knex.raw(`
        ALTER TABLE ${DEPLOYMENTS_TABLE}
        ALTER COLUMN "image" DROP DEFAULT,
        ALTER COLUMN "image" SET NOT NULL
    `);

    await knex.raw(`
        ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE}
        ALTER COLUMN "image" DROP NOT NULL,
        ALTER COLUMN "cpu_milli" DROP NOT NULL,
        ALTER COLUMN "memory_mb" DROP NOT NULL,
        ALTER COLUMN "storage_mb" DROP NOT NULL
    `);

    await knex.raw(`
        ALTER TABLE ${NODE_CONFIG_OVERRIDES_TABLE}
        ADD COLUMN IF NOT EXISTS "notes" text
    `);
}

export async function down(): Promise<void> {}

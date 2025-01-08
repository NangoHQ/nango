import type { Knex } from 'knex';
import { NODE_CONFIG_OVERRIDES_TABLE } from '../../models/node_config_overrides.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
            CREATE TABLE ${NODE_CONFIG_OVERRIDES_TABLE} (
                id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                routing_id varchar(255) NOT NULL UNIQUE,
                image varchar(255) NOT NULL,
                cpu_milli int NOT NULL,
                memory_mb int NOT NULL,
                storage_mb int NOT NULL,
                created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
}

export async function down(): Promise<void> {
    //
}

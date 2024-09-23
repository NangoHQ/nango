import type { Knex } from 'knex';
import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TYPE private_key_entity_types AS ENUM (
                'session',
                'connection',
                'environment'
            );
        `);
        await trx.raw(`
            CREATE TABLE IF NOT EXISTS ${PRIVATE_KEYS_TABLE} (
                id SERIAL PRIMARY KEY,
                display_name VARCHAR(255) NOT NULL,
                account_id INTEGER NOT NULL,
                environment_id INTEGER NOT NULL,
                encrypted BYTEA,
                hash TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP WITH TIME ZONE,
                last_access_at TIMESTAMP WITH TIME ZONE,
                entity_type private_key_entity_types NOT NULL,
                entity_id INTEGER NOT NULL
            );
        `);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${PRIVATE_KEYS_TABLE}`);
}

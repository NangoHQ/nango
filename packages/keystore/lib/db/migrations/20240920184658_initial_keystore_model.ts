import type { Knex } from 'knex';
import { PRIVATE_KEYS_TABLE } from '../../models/privatekeys.js';

export const config = {
    transaction: false
};

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TYPE entity_types AS ENUM (
                'session',
                'connection',
                'environment'
            );
        `);
        await trx.raw(`
            CREATE TABLE IF NOT EXISTS ${PRIVATE_KEYS_TABLE} (
                id SERIAL PRIMARY KEY,
                display_name VARCHAR(255) NOT NULL,
                encrypted BYTEA NOT NULL,
                hash TEXT NOT NULL UNIQUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                deleted_at TIMESTAMP WITH TIME ZONE,
                expires_at TIMESTAMP WITH TIME ZONE,
                last_access_at TIMESTAMP WITH TIME ZONE,
                entity_type entity_types NOT NULL,
                entity_id INTEGER NOT NULL
            );
        `);
    });
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_${PRIVATE_KEYS_TABLE}_type_hash" ON ${PRIVATE_KEYS_TABLE} (entity_type, hash);`);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${PRIVATE_KEYS_TABLE}`);
}

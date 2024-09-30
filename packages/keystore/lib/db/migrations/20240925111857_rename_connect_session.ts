import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TYPE private_key_entity_types RENAME VALUE 'session' TO 'connect_session';
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        ALTER TYPE private_key_entity_types RENAME VALUE 'connect_session' TO 'session';
    `);
}

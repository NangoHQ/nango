import type { Knex } from 'knex';
import { LEADER_LOCKS_TABLE } from '../../workers/leader.election.js';

export async function up(knex: Knex): Promise<void> {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS ${LEADER_LOCKS_TABLE} (
            key varchar(255) PRIMARY KEY,
            node_id varchar(255) NOT NULL,
            acquired_at timestamp with time zone NOT NULL
        );
    `);
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`
        DROP TABLE IF EXISTS ${LEADER_LOCKS_TABLE};
    `);
}

import type { Knex } from 'knex';
import { NODES_TABLE } from '../../models/nodes.js';
import { DEPLOYMENTS_TABLE } from '../../models/deployments.js';

export async function up(knex: Knex): Promise<void> {
    await knex.transaction(async (trx) => {
        await trx.raw(`
            CREATE TABLE ${DEPLOYMENTS_TABLE} (
                id SERIAL PRIMARY KEY,
                commit_id char(40) NOT NULL,
                created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                superseded_at timestamp with time zone
            );
        `);
        await trx.raw(`
            CREATE INDEX idx_${DEPLOYMENTS_TABLE}_active ON ${DEPLOYMENTS_TABLE}(superseded_at) WHERE superseded_at IS NULL;
        `);
        await trx.raw(`
            CREATE TYPE node_states AS ENUM (
                'PENDING',
                'STARTING',
                'RUNNING',
                'OUTDATED',
                'FINISHING',
                'IDLE',
                'TERMINATED',
                'ERROR'
            );
        `);
        await trx.raw(`
            CREATE TABLE ${NODES_TABLE} (
                id SERIAL PRIMARY KEY,
                routing_id varchar(255) NOT NULL,
                deployment_id int NOT NULL REFERENCES deployments(id) ON DELETE CASCADE,
                url varchar(1024),
                state node_states NOT NULL,
                image varchar(255) NOT NULL,
                cpu_milli int NOT NULL,
                memory_mb int NOT NULL,
                storage_mb int NOT NULL,
                error text,
                created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
                last_state_transition_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await trx.raw(`
            CREATE INDEX idx_${NODES_TABLE}_routingId_state
                ON ${NODES_TABLE}(routing_id, state)
                WHERE state IN ('PENDING', 'STARTING', 'RUNNING', 'OUTDATED');
        `);
    });
}

export async function down(knex: Knex): Promise<void> {
    await knex.raw(`DROP TABLE IF EXISTS ${DEPLOYMENTS_TABLE}`);
    await knex.raw(`DROP TABLE IF EXISTS ${NODES_TABLE}`);
    await knex.raw(`DROP TYPE IF EXISTS node_states`);
}

exports.config = { transaction: false };

const table = 'agent_sessions_inline_functions';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TABLE IF NOT EXISTS ${table} (
            uuid UUID PRIMARY KEY,
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            agent_session_id UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
            code TEXT NOT NULL,
            description TEXT,
            result_record_id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS agent_sessions_inline_functions_environment_id_idx
            ON ${table} (environment_id);

        CREATE INDEX IF NOT EXISTS agent_sessions_inline_functions_agent_session_id_idx
            ON ${table} (agent_session_id);

        CREATE INDEX IF NOT EXISTS agent_sessions_inline_functions_created_at_idx
            ON ${table} (created_at);
    `);
};

exports.down = async function () {};

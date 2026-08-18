exports.config = { transaction: false };

const table = 'agent_sessions';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TABLE IF NOT EXISTS ${table} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            account_id INTEGER NOT NULL REFERENCES _nango_accounts(id) ON DELETE CASCADE,
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            resolved_connections JSONB NOT NULL,
            compiled_toolset JSONB NOT NULL,
            meta_tools JSONB NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            ended_at TIMESTAMP WITH TIME ZONE,
            ended_reason TEXT CHECK (ended_reason IN ('terminated', 'expired')),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            CONSTRAINT agent_sessions_end_state_check CHECK (
                (ended_at IS NULL AND ended_reason IS NULL)
                OR (ended_at IS NOT NULL AND ended_reason IS NOT NULL)
            )
        );

        CREATE INDEX IF NOT EXISTS agent_sessions_environment_id_idx
            ON ${table} (environment_id);

        CREATE INDEX IF NOT EXISTS agent_sessions_account_id_idx
            ON ${table} (account_id);

        CREATE INDEX IF NOT EXISTS agent_sessions_active_expiration_idx
            ON ${table} (expires_at)
            WHERE ended_at IS NULL;
    `);
};

exports.down = async function () {};

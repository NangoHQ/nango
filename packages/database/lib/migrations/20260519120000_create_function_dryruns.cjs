exports.config = { transaction: false };

const table = 'function_dryruns';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TABLE IF NOT EXISTS ${table} (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            request JSONB NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'succeeded', 'failed')),
            sandbox_id TEXT,
            output TEXT,
            result JSONB,
            has_result BOOLEAN NOT NULL DEFAULT FALSE,
            error JSONB,
            duration_ms INTEGER,
            execution_timeout_at TIMESTAMP WITH TIME ZONE,
            started_at TIMESTAMP WITH TIME ZONE,
            completed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS function_dryruns_environment_id_id_idx
            ON ${table} (environment_id, id);

        CREATE INDEX IF NOT EXISTS function_dryruns_running_timeout_idx
            ON ${table} (execution_timeout_at)
            WHERE status = 'running' AND execution_timeout_at IS NOT NULL;
    `);
};

exports.down = async function () {};

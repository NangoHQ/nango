exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TABLE IF NOT EXISTS execution_events (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            integration_id TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('SYNC', 'ACTION')),
            status TEXT NOT NULL CHECK (status IN ('STARTED', 'SUCCESS', 'FAILURE')),
            duration_ms INTEGER,
            retries INTEGER,
            api_calls_count INTEGER,
            error_type TEXT,
            error_message TEXT,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS execution_events_environment_id_integration_id_idx
            ON execution_events (environment_id, integration_id);

        CREATE INDEX IF NOT EXISTS execution_events_created_at_idx
            ON execution_events (created_at);

        CREATE TABLE IF NOT EXISTS integration_health_metrics (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            integration_id TEXT NOT NULL,
            connection_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('HEALTHY', 'DEGRADED', 'FAILING', 'PAUSED')),
            last_success_at TIMESTAMP WITH TIME ZONE,
            last_failure_at TIMESTAMP WITH TIME ZONE,
            success_count_24h INTEGER DEFAULT 0,
            failure_count_24h INTEGER DEFAULT 0,
            avg_runtime_ms INTEGER,
            api_calls_24h INTEGER DEFAULT 0,
            top_error_type TEXT,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
            UNIQUE (environment_id, integration_id, connection_id)
        );

        CREATE INDEX IF NOT EXISTS integration_health_metrics_environment_id_idx
            ON integration_health_metrics (environment_id);
    `);
};

exports.down = async function () {};

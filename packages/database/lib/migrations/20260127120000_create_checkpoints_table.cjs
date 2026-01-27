const CHECKPOINTS_TABLE = 'checkpoints';

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS ${CHECKPOINTS_TABLE} (
            id SERIAL PRIMARY KEY,
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id) ON DELETE CASCADE,
            key VARCHAR(255) NOT NULL,
            checkpoint JSONB NOT NULL DEFAULT '{}',
            version INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
            UNIQUE(environment_id, key)
        )
    `);

    // Index to optimize prefix searches on the 'key' column
    // Note: The UNIQUE(environment_id, key) constraint already creates an index for exact lookups
    // This is useful for queries that look for keys starting with a certain prefix
    // e.g., WHERE key LIKE 'prefix%'
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_checkpoints_key_prefix
            ON ${CHECKPOINTS_TABLE}
            USING BTREE (environment_id, key varchar_pattern_ops)
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

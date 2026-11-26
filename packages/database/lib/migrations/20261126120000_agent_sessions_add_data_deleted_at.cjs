exports.config = { transaction: false };

const table = 'agent_sessions';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS data_deleted_at TIMESTAMP WITH TIME ZONE`);
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS agent_sessions_data_pending_deletion_idx
            ON ${table} (ended_at)
            WHERE ended_at IS NOT NULL AND data_deleted_at IS NULL
    `);
};

exports.down = async function () {};

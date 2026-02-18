exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_jobs_syncid_running_createdat ON "_nango_sync_jobs" (sync_id, created_at DESC) WHERE status = 'RUNNING';`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {};

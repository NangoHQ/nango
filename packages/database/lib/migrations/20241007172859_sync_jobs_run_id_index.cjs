exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_jobs_run_id" ON "_nango_sync_jobs" USING BTREE ("run_id") WHERE (deleted=false)`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_sync_jobs_run_id"`);
};

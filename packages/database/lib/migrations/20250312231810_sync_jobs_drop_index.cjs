exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_sync_jobs_run_id"`);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_jobs_syncid_createdat_where_deleted"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sync_jobs_run_id" ON "_nango_sync_jobs" USING BTREE ("run_id") WHERE (deleted=false)`);
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_jobs_syncid_createdat_where_deleted" ON "_nango_sync_jobs" USING BTREE ("sync_id", "created_at" DESC) WHERE deleted = false'
    );
};

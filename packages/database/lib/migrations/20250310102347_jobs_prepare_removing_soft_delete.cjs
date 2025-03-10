exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`CREATE INDEX CONCURRENTLY "idx_sync_jobs_run_id2" ON "_nango_sync_jobs" USING BTREE ("run_id");`);
    await knex.raw(`CREATE INDEX CONCURRENTLY "idx_jobs_syncid_createdat" ON "_nango_sync_jobs" USING BTREE ("sync_id","created_at" DESC)`);

    // Unused index
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "_nango_sync_jobs_deleted_index"`);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "_nango_sync_jobs_sync_id_deleted_index"`);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_jobs_id_status_type_where_delete"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY "idx_sync_jobs_run_id2"`);
    await knex.raw(`DROP INDEX CONCURRENTLY "idx_jobs_syncid_createdat"`);
};

exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_jobs_syncid_createdat_where_deleted" ON "_nango_sync_jobs" USING BTREE ("sync_id", "created_at" DESC) WHERE deleted = false'
    );
};

exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_jobs_syncid_createdat_where_deleted');
};

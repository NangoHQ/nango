exports.config = { transaction: false };

exports.up = function (knex) {
    return knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_jobs_id_status_type_where_delete" ON "nango"."_nango_sync_jobs" USING BTREE ("sync_id","status","type") WHERE deleted = false'
    );
};

exports.down = function (knex) {
    return knex.schema.raw('DROP INDEX CONCURRENTLY idx_jobs_id_status_type_where_delete');
};

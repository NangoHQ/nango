exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = function (knex) {
    return knex.schema.raw(
        `CREATE INDEX CONCURRENTLY "idx_jobs_id_status_type_where_delete" ON "${schema}"."_nango_sync_jobs" USING BTREE ("sync_id","status","type") WHERE deleted = false`
    );
};

exports.down = function (knex) {
    return knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_jobs_id_status_type_where_delete"`);
};

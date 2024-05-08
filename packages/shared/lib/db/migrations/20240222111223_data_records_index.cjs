exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = function (knex) {
    return knex.schema.raw(
        `CREATE INDEX CONCURRENTLY "idx_records_created_id_connection_model" ON "${schema}"."_nango_sync_data_records" USING BTREE ("created_at","id","nango_connection_id","model")`
    );
};

exports.down = function (knex) {
    return knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}".idx_records_created_id_connection_model`);
};

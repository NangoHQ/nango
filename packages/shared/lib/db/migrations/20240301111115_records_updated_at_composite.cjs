exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = function (knex) {
    return knex.schema.raw(
        `CREATE INDEX CONCURRENTLY idx_nango_records_updated_at_composite ON "${schema}"."_nango_sync_data_records" (nango_connection_id, model, updated_at, id)`
    );
};

exports.down = function (knex) {
    return knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}".idx_nango_records_updated_at_composite`);
};

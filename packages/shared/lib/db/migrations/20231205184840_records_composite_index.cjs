const tableName = '_nango_sync_data_records';

exports.config = { transaction: false };

exports.up = function(knex) {
  return knex.schema.raw('CREATE INDEX CONCURRENTLY idx_nango_records_composite ON nango._nango_sync_data_records (nango_connection_id, model, created_at, id)');
};

exports.down = function(knex) {
  return knex.schema.raw('DROP INDEX CONCURRENTLY idx_nango_records_composite');
};

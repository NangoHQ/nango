exports.config = { transaction: false };

exports.up = function(knex) {
  await knex.schema.raw('CREATE UNIQUE INDEX CONCURRENTLY "idx_records_id_pkey" ON "nango"."_nango_sync_data_records" USING BTREE ("id")');
};

exports.down = function(knex) {
  await knex.schema.raw('DROP INDEX CONCURRENTLY idx_records_id_pkey');
};

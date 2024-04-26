const tableName = '_nango_oauth_sessions';

exports.up = function(knex) {
  return knex.schema.alterTable(tableName, function (table) {
    table.string('final_redirect_url');
  });
};

exports.down = function(knex) {
  return knex.schema.table(tableName, function (table) {
    table.dropColumn('final_redirect_url');
  });
};

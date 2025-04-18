const tableName = '_nango_sync_endpoints';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.increments('id').primary();
        table.string('method').notNullable().index();
        table.string('path').notNullable().index();
        table.string('model').nullable();
        table.integer('sync_config_id').references('id').inTable('_nango_sync_configs').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(tableName);
};

const tableName = '_nango_sync_endpoints';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable(tableName, function (table) {
        table.increments('id').primary();
        table.string('method').notNullable().index();
        table.string('path').notNullable().index();
        table.string('model').nullable();
        table.integer('sync_config_id').references('id').inTable('nango._nango_sync_configs').notNullable();
        table.timestamps(true, true);
    });
}

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(tableName);
}

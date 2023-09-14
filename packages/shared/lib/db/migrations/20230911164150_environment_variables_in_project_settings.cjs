const tableName = '_nango_environment_variables';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable(tableName, function (table) {
        table.increments('id').primary();
        table.integer('environment_id').unsigned().references('id').inTable(`nango._nango_environments`);
        table.string('name').notNullable();
        table.string('value').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(tableName);
};

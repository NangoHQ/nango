const tableName = '_nango_environment_variables';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.increments('id').primary();
        table.integer('environment_id').unsigned().references('id').inTable(`_nango_environments`);
        table.string('name').notNullable();
        table.string('value').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(tableName);
};

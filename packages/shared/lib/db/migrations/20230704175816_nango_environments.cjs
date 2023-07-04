exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').createTable('_nango_environments', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable('_nango_environments');
};

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable('_nango_cache', function (table) {
        table.string('key').notNullable();
        table.json('value').notNullable();
        table.timestamps(true, true);

        table.unique('key')
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable('_nango_db_config');
};

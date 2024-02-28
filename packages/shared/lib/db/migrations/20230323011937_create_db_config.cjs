exports.up = function (knex, _) {
    return knex.schema.createTable('_nango_db_config', function (table) {
        table.string('encryption_key_hash');
        table.boolean('encryption_complete').defaultTo(false);
    });
};

exports.down = function (knex, _) {
    return knex.schema.dropTable('_nango_db_config');
};

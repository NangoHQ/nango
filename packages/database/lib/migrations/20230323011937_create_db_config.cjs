exports.up = function (knex) {
    return knex.schema.createTable('_nango_db_config', function (table) {
        table.string('encryption_key_hash');
        table.boolean('encryption_complete').defaultTo(false);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable('_nango_db_config');
};

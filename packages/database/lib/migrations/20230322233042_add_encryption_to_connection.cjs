exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.string('credentials_iv');
        table.string('credentials_tag');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.dropColumn('credentials_iv');
        table.dropColumn('credentials_tag');
    });
};

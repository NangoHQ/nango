exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.text('oauth_scopes').nullable();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.text('oauth_scopes');
    });
};

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_oauth_sessions', function (table) {
        table.text('oauth_scopes').nullable();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_oauth_sessions', function (table) {
        table.dropColumn('oauth_scopes');
    });
};

exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_oauth_sessions', function (table) {
        table.text('api_redirect_url').nullable();
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_oauth_sessions', function (table) {
        table.dropColumn('api_redirect_url');
    });
};

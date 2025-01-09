exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.string('oauth_client_secret_iv');
        table.string('oauth_client_secret_tag');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.dropColumn('oauth_client_secret_iv');
        table.dropColumn('oauth_client_secret_tag');
    });
};

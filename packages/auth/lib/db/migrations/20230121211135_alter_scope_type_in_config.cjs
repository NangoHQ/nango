exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_configs', function (table) {
        table.text('oauth_scopes').alter({ alterType: true });
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_configs', function (table) {
        table.string('oauth_scopes').alter({ alterType: true });
    });
};

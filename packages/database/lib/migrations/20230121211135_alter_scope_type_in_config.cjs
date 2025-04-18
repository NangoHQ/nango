exports.up = function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.text('oauth_scopes').alter({ alterType: true });
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.string('oauth_scopes').alter({ alterType: true });
    });
};

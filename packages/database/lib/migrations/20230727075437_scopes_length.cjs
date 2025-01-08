const CONFIGS_TABLE = '_nango_configs';

exports.up = async function (knex) {
    return knex.schema.alterTable(CONFIGS_TABLE, function (table) {
        table.text('oauth_scopes').alter({ alterType: true });
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(CONFIGS_TABLE, function (table) {
        table.string('oauth_scopes').alter({ alterType: true });
    });
};

const TABLE_NAME = '_nango_configs';

exports.up = async function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.string('oauth_client_id', 1024).nullable().alter({ alterType: true });
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.string('oauth_client_id', 255).nullable().alter({ alterType: true });
    });
};

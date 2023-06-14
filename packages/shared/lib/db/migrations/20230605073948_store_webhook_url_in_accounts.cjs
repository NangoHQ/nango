exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_accounts', function (table) {
        table.text('webhook_url');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_accounts', function (table) {
        table.dropColumn('webhook_url');
    });
};


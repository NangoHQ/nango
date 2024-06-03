exports.up = async function (knex, _) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.text('webhook_url');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.dropColumn('webhook_url');
    });
};

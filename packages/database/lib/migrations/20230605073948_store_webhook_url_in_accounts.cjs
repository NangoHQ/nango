exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.text('webhook_url');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.dropColumn('webhook_url');
    });
};

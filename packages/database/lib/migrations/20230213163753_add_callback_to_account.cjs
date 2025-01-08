exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.text('callback_url');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.dropColumn('callback_url');
    });
};

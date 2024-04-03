const tableName = '_nango_accounts';

exports.up = async function (knex, _) {
    await knex.schema.alterTable(tableName, function (table) {
        table.boolean('is_paying').defaultTo(false);
        table.string('subscription_type');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.table(tableName, function (table) {
        table.dropColumn('is_paying');
        table.dropColumn('subscription_type');
    });
};

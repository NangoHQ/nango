const tableName = '_nango_accounts';

exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, function (table) {
        table.boolean('is_capped').defaultTo(true);
    });
};

exports.down = async function (knex) {
    await knex.schema.table(tableName, function (table) {
        table.dropColumn('is_capped');
    });
};

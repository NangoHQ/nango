exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_configs', function (table) {
        table.integer('account_id').references('id').inTable('nango._nango_accounts');
        table.dropUnique('unique_key');
        table.unique(['unique_key', 'account_id']);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_configs', function (table) {
        table.dropColumn('account_id');
        table.dropUnique(['unique_key', 'account_id']);
        table.unique('unique_key');
    });
};

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.integer('account_id').references('id').inTable('nango._nango_accounts');
        table.dropUnique(['provider_config_key', 'connection_id']);
        table.unique(['provider_config_key', 'connection_id', 'account_id']);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_connections', function (table) {
        table.dropColumn('account_id');
        table.dropUnique(['provider_config_key', 'connection_id', 'account_id']);
        table.unique(['provider_config_key', 'connection_id']);
    });
};

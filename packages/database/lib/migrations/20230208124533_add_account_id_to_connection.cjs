exports.up = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.integer('account_id').references('id').inTable('_nango_accounts').defaultTo(0).notNullable();
        table.dropUnique(['provider_config_key', 'connection_id']);
        table.unique(['provider_config_key', 'connection_id', 'account_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_connections', function (table) {
        table.dropColumn('account_id');
        table.dropUnique(['provider_config_key', 'connection_id', 'account_id']);
        table.unique(['provider_config_key', 'connection_id']);
    });
};

const tableName = '_nango_unified_syncs';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable(tableName, function (table) {
        table.increments('id').primary();
        table.string('provider_config_key').notNullable();
        table.string('connection_id').notNullable();
        table.integer('account_id').references('id').inTable('nango._nango_accounts').defaultTo(0).notNullable();
        table.enu('status', ['RUNNING', 'PAUSED', 'STOPPED', 'SUCCESS']).defaultTo('INITIAL').notNullable();
        table.enu('type', ['INITIAL', 'INCREMENTAL']).defaultTo('initial').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(tableName);
};

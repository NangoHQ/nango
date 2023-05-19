const tableName = '_nango_sync_schedules';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable(tableName, function (table) {
        table.increments('id').primary();
        table.integer('nango_connection_id').references('id').inTable('nango._nango_connections').defaultTo(0).notNullable();
        table.string('frequency');
        table.string('schedule_id');
        table.enu('status', ['RUNNING', 'PAUSED', 'STOPPED']).defaultTo('RUNNING').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(tableName);
};

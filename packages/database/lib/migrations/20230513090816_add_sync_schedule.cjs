const tableName = '_nango_sync_schedules';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.increments('id').primary();
        table.integer('nango_connection_id').references('id').inTable('_nango_connections').defaultTo(0).notNullable().onDelete('CASCADE');
        table.string('frequency');
        table.string('schedule_id');
        table.enu('status', ['RUNNING', 'PAUSED', 'STOPPED']).defaultTo('RUNNING').notNullable();
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(tableName);
};

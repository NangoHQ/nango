const tableName = '_nango_sync_jobs';

exports.up = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.increments('id').primary();
        table.integer('nango_connection_id').unsigned().notNullable();
        table.string('sync_name').notNullable();
        table.enu('status', ['RUNNING', 'PAUSED', 'STOPPED', 'SUCCESS']).defaultTo('RUNNING').notNullable();
        table.enu('type', ['INITIAL', 'INCREMENTAL']).defaultTo('initial').notNullable();
        table.timestamps(true, true);

        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(tableName);
};

const DB_TABLE = '_nango_active_logs';

exports.up = async function (knex) {
    return knex.schema.createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.string('type', 'varchar(255)').notNullable();
        table.string('action', 'varchar(255)').notNullable();
        table.integer('connection_id').unsigned().notNullable();
        table.foreign('connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');
        table.integer('activity_log_id').unsigned();
        table.foreign('activity_log_id').references('id').inTable('_nango_activity_logs').onDelete('CASCADE');
        table.string('log_id');
        table.boolean('active').defaultTo(true);
        table.uuid('sync_id').defaultTo(null);
        table.foreign('sync_id').references('id').inTable('_nango_syncs').onDelete('CASCADE');
        table.timestamps(true, true);
    });
};

exports.down = async function (knex) {
    return knex.schema.dropTable(DB_TABLE);
};

const tableName = '_nango_unified_tickets';

exports.up = function (knex) {
    return knex.schema.dropTable(tableName);
};

exports.down = function (knex) {
    return knex.schema.createTable(tableName, function (table) {
        table.uuid('id').notNullable();
        table.string('external_id').notNullable();
        table.string('title');
        table.text('description');
        table.enu('status', ['open', 'closed', 'in_progress', 'custom']).defaultTo('open').notNullable();
        table.string('external_raw_status');
        table.string('comments');
        table.integer('number_of_comments');
        table.string('creator');
        table.dateTime('external_created_at').notNullable();
        table.dateTime('external_updated_at').notNullable();
        table.dateTime('deleted_at');
        table.jsonb('raw_json');
        table.string('data_hash').notNullable();
        table.integer('nango_connection_id').unsigned().notNullable();
        table.timestamps(true, true);

        table.foreign('nango_connection_id').references('id').inTable('_nango_connections').onDelete('CASCADE');

        table.unique(['nango_connection_id', 'external_id']);
    });
};

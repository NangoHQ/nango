const tableName = '_nango_unified_tickets';

exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').createTable(tableName, function (table) {
        table.uuid('id').notNullable();
        table.integer('external_id').notNullable();
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
        table.timestamps(true, true);
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').dropTable(tableName);
};

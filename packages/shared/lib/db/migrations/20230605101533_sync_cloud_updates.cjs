const syncConfigs = '_nango_sync_configs';
const syncUnifiedTickets = '_nango_sync_unified_tickets';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(syncConfigs, function (table) {
        table.dropColumn('provider');
        table.dropColumn('snippet');

        table.string('sync_name').notNullable();
        table.integer('nango_config_id').unsigned().notNullable();
        table.foreign('nango_config_id').references('id').inTable('nango._nango_configs').onDelete('CASCADE');
        table.string('file_location').notNullable();
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(syncConfigs, function (table) {
        table.dropColumn('sync_name');
        table.dropColumn('nango_config_id');
        table.dropColumn('file_location');
    });

    await knex.schema.withSchema('nango').createTable(syncUnifiedTickets, function (table) {
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

        table.foreign('nango_connection_id').references('id').inTable('nango._nango_connections').onDelete('CASCADE');

        table.unique(['nango_connection_id', 'external_id']);
    });
};

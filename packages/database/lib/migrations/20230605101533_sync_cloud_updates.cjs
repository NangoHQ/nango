const syncConfigs = '_nango_sync_configs';

exports.up = async function (knex) {
    await knex.schema.alterTable(syncConfigs, function (table) {
        table.dropColumn('provider');
        table.dropColumn('snippet');

        table.string('sync_name').notNullable();
        table.integer('nango_config_id').unsigned().notNullable();
        table.foreign('nango_config_id').references('id').inTable('_nango_configs').onDelete('CASCADE');
        table.string('file_location').notNullable();
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(syncConfigs, function (table) {
        table.string('provider');
        table.text('snippet');

        table.dropColumn('sync_name');
        table.dropColumn('nango_config_id');
        table.dropColumn('file_location');
    });
};

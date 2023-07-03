const SYNC_TABLE = '_nango_syncs';
const SYNC_CONFIG = '_nango_sync_configs';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(SYNC_TABLE, function (table) {
        table.dropColumn('models');
    });

    await knex.schema.withSchema('nango').alterTable(SYNC_CONFIG, function (table) {
        table.dropColumn('sync_id');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(SYNC_TABLE, function (table) {
        table.specificType('models', 'text ARRAY');
    });
    await knex.schema.withSchema('nango').alterTable(SYNC_CONFIG, function (table) {
        table.uuid('sync_id').references('id').inTable(`nango.${SYNC_TABLE}`).onDelete('CASCADE');
    });
};


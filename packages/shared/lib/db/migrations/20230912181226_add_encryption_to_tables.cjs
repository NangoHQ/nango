const SECRETS_TABLE = '_nango_environment_variables';
const RECORDS_TABLE = '_nango_sync_data_records';
const DELETED_RECORDS_TABLE = '_nango_sync_data_records_deletes';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(SECRETS_TABLE, function (table) {
        table.string('value_iv');
        table.string('value_tag');
    });
    await knex.schema.withSchema('nango').alterTable(DELETED_RECORDS_TABLE, function (table) {
        table.string('json_iv');
        table.string('json_tag');
    });
    return knex.schema.withSchema('nango').alterTable(RECORDS_TABLE, function (table) {
        table.string('json_iv');
        table.string('json_tag');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(RECORDS_TABLE, function (table) {
        table.dropColumn('json_iv');
        table.dropColumn('json_tag');
    });
    await knex.schema.withSchema('nango').alterTable(DELETED_RECORDS_TABLE, function (table) {
        table.dropColumn('json_iv');
        table.dropColumn('json_tag');
    });
    return knex.schema.withSchema('nango').alterTable(SECRETS_TABLE, function (table) {
        table.dropColumn('value_iv');
        table.dropColumn('value_tag');
    });
};

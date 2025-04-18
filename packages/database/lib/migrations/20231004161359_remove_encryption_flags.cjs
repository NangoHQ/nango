const RECORDS_TABLE = '_nango_sync_data_records';
const DELETED_RECORDS_TABLE = '_nango_sync_data_records_deletes';

exports.up = async function (knex) {
    //await knex.schema.alterTable(RECORDS_TABLE, function (table) {
    //table.dropColumn('json_iv');
    //table.dropColumn('json_tag');
    //});
    return knex.schema.alterTable(DELETED_RECORDS_TABLE, function (table) {
        table.dropColumn('json_iv');
        table.dropColumn('json_tag');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(DELETED_RECORDS_TABLE, function (table) {
        table.string('json_iv');
        table.string('json_tag');
    });
    return knex.schema.alterTable(RECORDS_TABLE, function (table) {
        table.string('json_iv');
        table.string('json_tag');
    });
};

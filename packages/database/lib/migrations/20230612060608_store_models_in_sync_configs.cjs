const TABLE = '_nango_sync_configs';

exports.up = async function (knex) {
    await knex.schema.alterTable(TABLE, function (table) {
        table.jsonb('model_schema').defaultTo('{}');
    });
};

exports.down = async function (knex) {
    await knex.schema.alterTable(TABLE, function (table) {
        table.dropColumn('model_schema');
    });
};

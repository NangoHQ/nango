const TABLE = '_nango_sync_configs';

exports.up = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(TABLE, function (table) {
        table.jsonb('model_schema').defaultTo('{}');
    });
};

exports.down = async function (knex, _) {
    await knex.schema.withSchema('nango').alterTable(TABLE, function (table) {
        table.dropColumn('model_schema');
    });
};


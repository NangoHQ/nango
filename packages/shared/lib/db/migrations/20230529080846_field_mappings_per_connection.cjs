const tableName = '_nango_connections';

exports.up = async function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.jsonb('field_mappings').defaultTo('{}');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable(tableName, function (table) {
        table.dropColumn('field_mappings');
    });
};

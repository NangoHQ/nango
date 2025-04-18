const tableName = '_nango_environments';

exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, function (table) {
        table.uuid('uuid').defaultTo(knex.raw('uuid_generate_v4()')).index();
    });
};

exports.down = async function (knex) {
    await knex.schema.table(tableName, function (table) {
        table.dropColumn('uuid');
    });
};

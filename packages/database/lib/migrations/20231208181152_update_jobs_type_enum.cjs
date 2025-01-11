const tableName = '_nango_sync_jobs';

exports.up = function (knex) {
    return knex.schema
        .alterTable(tableName, function (table) {
            table.string('type_new').defaultsTo('initial').notNullable();
        })
        .then(() =>
            knex.raw(`
    UPDATE ${tableName} SET type_new = type;
  `)
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.dropColumn('type');
            })
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.renameColumn('type_new', 'type');
            })
        );
};

exports.down = function (knex) {
    return knex.schema
        .alterTable(tableName, function (table) {
            table.enu('type', ['INITIAL', 'INCREMENTAL']).defaultTo('initial').notNullable();
        })
        .then(() =>
            knex.raw(`
    UPDATE ${tableName} SET type_new = type;
  `)
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.dropColumn('type');
            })
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.renameColumn('type_new', 'type');
            })
        );
};

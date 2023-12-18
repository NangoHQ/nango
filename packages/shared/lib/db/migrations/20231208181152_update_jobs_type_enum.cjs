const tableName = '_nango_sync_jobs';

exports.up = function(knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function(table) {
        table.string('type_new').defaultsTo('initial').notNullable();
    })
        .then(() => knex.raw(`
    UPDATE nango.${tableName} SET type_new = type;
  `))
        .then(() => knex.schema.withSchema('nango').alterTable(tableName, function(table) {
            table.dropColumn('type');
        }))
        .then(() => knex.schema.withSchema('nango').alterTable(tableName, function(table) {
            table.renameColumn('type_new', 'type');
        }));
};

exports.down = function(knex, _) {
    return knex.schema.withSchema('nango').alterTable(tableName, function(table) {
        table.enu('type', ['INITIAL', 'INCREMENTAL']).defaultTo('initial').notNullable();
    })
        .then(() => knex.raw(`
    UPDATE nango.${tableName} SET type_new = type;
  `))
        .then(() => knex.schema.withSchema('nango').alterTable(tableName, function(table) {
            table.dropColumn('type');
        }))
        .then(() => knex.schema.withSchema('nango').alterTable(tableName, function(table) {
            table.renameColumn('type_new', 'type');
        }));
};

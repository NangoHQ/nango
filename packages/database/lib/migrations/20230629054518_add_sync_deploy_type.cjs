const tableName = '_nango_activity_logs';

exports.up = function (knex) {
    return knex.schema
        .alterTable(tableName, function (table) {
            table.string('action_new').defaultTo('oauth').notNullable();
        })
        .then(() =>
            knex.raw(`
    UPDATE ${tableName} SET action_new = action;
  `)
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.dropColumn('action');
            })
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.renameColumn('action_new', 'action');
            })
        );
};

exports.down = function (knex) {
    return knex.schema
        .alterTable(tableName, function (table) {
            table.enu('action_new', ['oauth', 'proxy', 'token', 'sync']).defaultTo('oauth').notNullable();
        })
        .then(() =>
            knex.raw(`
    UPDATE ${tableName} SET action_new = action;
  `)
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.dropColumn('action');
            })
        )
        .then(() =>
            knex.schema.alterTable(tableName, function (table) {
                table.renameColumn('action_new', 'action');
            })
        );
};

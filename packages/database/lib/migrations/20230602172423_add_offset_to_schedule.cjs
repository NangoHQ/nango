const TABLE_NAME = '_nango_sync_schedules';

exports.up = function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.integer('offset').defaultTo(0);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.dropColumn('offset');
    });
};

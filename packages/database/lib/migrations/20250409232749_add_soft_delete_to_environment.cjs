/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('_nango_environments', function (table) {
        table.boolean('deleted').defaultTo(false);
        table.dateTime('deleted_at').defaultTo(null);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
    return knex.schema.alterTable('_nango_environments', function (table) {
        table.dropColumn('deleted');
        table.dropColumn('deleted_at');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('_nango_active_logs', function (trx) {
        trx.dropColumn('activity_log_id');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
    return knex.schema.alterTable('_nango_active_logs', function (trx) {
        trx.integer('activity_log_id').unsigned();
        trx.foreign('activity_log_id').references('id').inTable('_nango_activity_logs').onDelete('CASCADE');
    });
};

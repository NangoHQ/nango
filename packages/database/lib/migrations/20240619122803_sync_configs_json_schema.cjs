/**
 * @param {import('knex').Knex} knex
 */
exports.up = function (knex) {
    return knex.schema.alterTable('_nango_sync_configs', function (trx) {
        trx.json('models_json_schema').nullable();
    });
};
/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
    return knex.schema.alterTable('_nango_sync_configs', function (trx) {
        trx.dropColumn('models_json_schema');
    });
};

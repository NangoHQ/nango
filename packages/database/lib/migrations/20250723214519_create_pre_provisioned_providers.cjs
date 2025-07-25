/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    return knex.schema.createTable('_nango_pre_provisioned_providers', function (table) {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.string('oauth_client_id').nullable().defaultTo(null);
        table.string('oauth_client_secret').nullable().defaultTo(null);
        table.string('oauth_scopes').nullable().defaultTo(null);
        table.timestamps(true, true);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    return knex.schema.dropTable('_nango_pre_provisioned_providers');
};

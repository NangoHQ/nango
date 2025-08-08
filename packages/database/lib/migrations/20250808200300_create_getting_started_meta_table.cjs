exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('getting_started_meta', (table) => {
        table.increments('id').primary();
        table.integer('account_id').references('id').inTable('_nango_accounts').onDelete('CASCADE').notNullable();
        table.integer('environment_id').references('id').inTable('_nango_environments').onDelete('CASCADE').notNullable();
        table.integer('integration_id').references('id').inTable('_nango_configs').onDelete('SET NULL').nullable();
        table.timestamps(true, true);

        table.unique(['account_id']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTable('getting_started_meta');
};

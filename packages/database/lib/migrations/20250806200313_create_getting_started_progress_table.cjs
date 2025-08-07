exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('getting_started_progress', (table) => {
        table.increments('id').primary();
        table.integer('user_id').references('id').inTable('_nango_users').onDelete('CASCADE').notNullable();
        table.integer('integration_id').references('id').inTable('_nango_configs').onDelete('CASCADE').notNullable();
        table.integer('demo_connection_id').references('id').inTable('_nango_connections').onDelete('SET NULL').nullable();
        table.integer('step').defaultTo(0);
        table.boolean('complete').defaultTo(false);
        table.timestamps(true, true);

        table.unique(['user_id', 'integration_id']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTable('getting_started_progress');
};

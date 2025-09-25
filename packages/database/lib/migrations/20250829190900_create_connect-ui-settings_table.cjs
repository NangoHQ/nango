exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('connect_ui_settings', (table) => {
        table.increments('id').primary();
        table.integer('environment_id').references('id').inTable('_nango_environments').onDelete('CASCADE').notNullable();
        table.json('theme').notNullable();
        table.boolean('show_watermark').notNullable().defaultTo(true);
        table.timestamps(true, true);

        table.unique(['environment_id']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

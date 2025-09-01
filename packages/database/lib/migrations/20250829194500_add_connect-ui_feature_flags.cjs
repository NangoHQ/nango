exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('can_customize_connect_ui_theme').notNullable().defaultTo(false);
        table.boolean('can_disable_connect_ui_watermark').notNullable().defaultTo(false);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

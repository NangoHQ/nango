exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('connect_ui_settings', (table) => {
        table.enum('default_theme', ['light', 'dark', 'system']).notNullable().defaultTo('system');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

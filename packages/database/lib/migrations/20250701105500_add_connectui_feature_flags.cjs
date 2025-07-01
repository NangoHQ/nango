exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('connectui_colors_customization').defaultTo(false);
        table.boolean('connectui_disable_watermark').defaultTo(false);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.dropColumn('connectui_colors_customization');
        table.dropColumn('connectui_disable_watermark');
    });
};

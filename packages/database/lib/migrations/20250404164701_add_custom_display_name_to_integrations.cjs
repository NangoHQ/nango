/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_configs
        ADD COLUMN display_name VARCHAR(255)
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_configs
        DROP COLUMN display_name
    `);
};

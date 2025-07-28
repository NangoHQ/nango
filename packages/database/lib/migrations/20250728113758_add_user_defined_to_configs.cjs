/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_configs
        ADD COLUMN user_defined BOOLEAN NOT NULL DEFAULT TRUE
        `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

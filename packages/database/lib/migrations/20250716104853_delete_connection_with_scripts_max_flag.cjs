exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans DROP COLUMN connection_with_scripts_max;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {};

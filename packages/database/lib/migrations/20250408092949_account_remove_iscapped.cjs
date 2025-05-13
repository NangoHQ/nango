/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_accounts" DROP COLUMN "is_capped"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {
    // No coming back
};

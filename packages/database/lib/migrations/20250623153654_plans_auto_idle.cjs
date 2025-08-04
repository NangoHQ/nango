/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans"
ADD COLUMN "auto_idle" boolean DEFAULT true;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    //
};

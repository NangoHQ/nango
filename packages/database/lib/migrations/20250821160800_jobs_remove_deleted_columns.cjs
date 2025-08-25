exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_sync_jobs" DROP COLUMN "deleted", DROP COLUMN "deleted_at"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

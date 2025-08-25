exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_users ADD COLUMN closed_getting_started BOOLEAN NOT NULL DEFAULT FALSE`);
    await knex.raw(`
        UPDATE _nango_users
        SET closed_getting_started = closed
        FROM getting_started_progress
        WHERE _nango_users.id = getting_started_progress.user_id`);
    await knex.raw(`ALTER TABLE getting_started_progress DROP COLUMN closed`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

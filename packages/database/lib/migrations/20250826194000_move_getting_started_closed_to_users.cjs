exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_users ADD COLUMN getting_started_closed BOOLEAN NOT NULL DEFAULT FALSE`);
    await knex.raw(`
        UPDATE _nango_users
        SET getting_started_closed = closed
        FROM getting_started_progress
        WHERE _nango_users.id = getting_started_progress.user_id`);
    await knex.raw(`ALTER TABLE getting_started_progress DROP COLUMN closed`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

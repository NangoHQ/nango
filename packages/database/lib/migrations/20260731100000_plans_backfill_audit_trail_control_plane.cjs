exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans').whereNot('name', 'free').update({ has_audit_trail_control_plane: true });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

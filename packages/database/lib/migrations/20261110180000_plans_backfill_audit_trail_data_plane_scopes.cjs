exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex('plans')
        .whereNot('name', 'free')
        .update({ audit_trail_data_plane_scopes: ['read_credentials'] });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

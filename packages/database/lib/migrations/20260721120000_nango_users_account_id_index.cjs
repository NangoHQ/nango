exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "nango_users_account_id_active"
        ON "_nango_users" (account_id, role)
        WHERE suspended = false
    `);
};

exports.down = function () {};

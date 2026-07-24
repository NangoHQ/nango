exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS "nango_users_email_domain_active"
        ON "_nango_users" (LOWER(SPLIT_PART(email, '@', 2)))
        INCLUDE (account_id)
        WHERE suspended = false
    `);
};

exports.down = function () {};

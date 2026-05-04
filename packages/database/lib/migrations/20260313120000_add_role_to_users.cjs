exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_users
        ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'administrator'
        CONSTRAINT check_users_role CHECK (role IN ('administrator', 'production_support', 'development_full_access'))
    `);
};

exports.down = function () {};

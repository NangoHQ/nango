const CONFIGS_TABLE = '_nango_configs';
const SHARED_CREDENTIALS_TABLE = 'providers_shared_credentials';

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE ${CONFIGS_TABLE}
        ADD COLUMN shared_credentials_id INTEGER NULL
        REFERENCES ${SHARED_CREDENTIALS_TABLE}(id) ON DELETE SET NULL
    `);
    await knex.raw(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_${CONFIGS_TABLE}_shared_credentials_id
        ON ${CONFIGS_TABLE} (shared_credentials_id)
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

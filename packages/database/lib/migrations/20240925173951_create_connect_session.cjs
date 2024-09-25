const LINKED_PROFILES_TABLE = 'linked_profiles';
const CONNECT_SESSIONS_TABLE = 'connect_sessions';
const ACCOUNTS_TABLE = '_nango_accounts';
const ENVIRONMENTS_TABLE = '_nango_environments';

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    return knex
        .raw(
            `
            CREATE TABLE IF NOT EXISTS ${LINKED_PROFILES_TABLE} (
                id SERIAL PRIMARY KEY,
                profile_id VARCHAR(255) NOT NULL,
                account_id INTEGER REFERENCES ${ACCOUNTS_TABLE}(id) ON DELETE CASCADE,
                environment_id INTEGER REFERENCES ${ENVIRONMENTS_TABLE}(id) ON DELETE CASCADE,
                email VARCHAR(255) NOT NULL,
                display_name VARCHAR(255) NULL,
                organization_id VARCHAR(255) NULL,
                organization_display_name VARCHAR(255) NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )`
        )
        .then(() => {
            return knex.schema.raw(`
            CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_linked_profile_account_env_profile_id
                ON "${LINKED_PROFILES_TABLE}"
                USING BTREE (account_id, environment_id, profile_id)
        `);
        })
        .then(() => {
            return knex.schema.raw(`
                CREATE TABLE IF NOT EXISTS ${CONNECT_SESSIONS_TABLE} (
                    id SERIAL PRIMARY KEY,
                    linked_profile_id INTEGER REFERENCES ${LINKED_PROFILES_TABLE}(id) ON DELETE CASCADE,
                    account_id INTEGER REFERENCES ${ACCOUNTS_TABLE}(id) ON DELETE CASCADE,
                    environment_id INTEGER REFERENCES ${ENVIRONMENTS_TABLE}(id) ON DELETE CASCADE,
                    allowed_integrations VARCHAR(255)[] NULL,
                    integrations_config_defaults JSONB NULL,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )`);
        });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function (knex) {
    return knex.raw(`DROP TABLE IF EXISTS ${CONNECT_SESSIONS_TABLE}`);
};

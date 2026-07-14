exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS user_mfa_factors (
            id               SERIAL PRIMARY KEY,
            user_id          INTEGER NOT NULL UNIQUE REFERENCES _nango_users(id) ON DELETE CASCADE,
            type             VARCHAR(50) NOT NULL CONSTRAINT check_user_mfa_factor_type CHECK (type IN ('totp')),
            encrypted_secret VARCHAR(255) NOT NULL,
            iv               VARCHAR(255) NOT NULL,
            auth_tag         VARCHAR(255) NOT NULL,
            enabled_at       TIMESTAMPTZ,
            last_used_counter BIGINT,
            created_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at       TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_mfa_recovery_codes (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER NOT NULL REFERENCES _nango_users(id) ON DELETE CASCADE,
            code_hash  VARCHAR(255) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            used_at    TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_user_mfa_recovery_codes_active
            ON user_mfa_recovery_codes (user_id)
            WHERE used_at IS NULL;
    `);
};

exports.down = function () {};

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    /*
     * Corresponding model: DBAPISecret.
     * Column is_default indicates whether this is the default API key for this environment, e.g. for use in runners.
     */
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS api_secrets (
            id             SERIAL PRIMARY KEY,
            environment_id INTEGER NOT NULL REFERENCES _nango_environments(id),
            display_name   VARCHAR(255) NOT NULL,
            secret         VARCHAR(255) NOT NULL,
            iv             VARCHAR(255) NOT NULL,
            tag            VARCHAR(255) NOT NULL,
            hashed         VARCHAR(255) NOT NULL,
            is_default     BOOLEAN NOT NULL DEFAULT FALSE,
            created_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS api_secrets_environment_id ON api_secrets (environment_id);

        CREATE UNIQUE INDEX IF NOT EXISTS api_secrets_one_default_per_environment
            ON api_secrets (environment_id)
            WHERE is_default = true;

        INSERT INTO api_secrets (environment_id, display_name, secret, iv, tag, hashed, is_default)
            SELECT
                id                              AS environment_id,
                'default'                       AS display_name,
                coalesce(secret_key, '')        AS secret,
                coalesce(secret_key_iv, '')     AS iv,
                coalesce(secret_key_tag, '')    AS tag,
                coalesce(secret_key_hashed, '') AS hashed,
                TRUE                            AS is_default
            FROM
                _nango_environments;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        DROP TABLE IF EXISTS api_secrets;
    `);
};

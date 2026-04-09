exports.config = { transaction: false };

/**
 * NAN-5088: API Key Permissions — Step 3
 *
 * Backfill: copies all existing default api_secrets into customer_keys as both
 * API keys (key_type='api') and webhook signing keys (key_type='webhook_signing'),
 * and creates the corresponding environment relations.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        BEGIN;

        -- Copy default secrets as API keys
        INSERT INTO customer_keys (account_id, key_type, display_name, scopes, secret, iv, tag, hashed, created_at, updated_at)
            SELECT
                e.account_id,
                'api'                            AS key_type,
                'Default - Full access'          AS display_name,
                '{environment:*}'::text[]        AS scopes,
                s.secret,
                s.iv,
                s.tag,
                s.hashed,
                s.created_at,
                s.updated_at
            FROM api_secrets s
            JOIN _nango_environments e ON e.id = s.environment_id
            WHERE s.is_default = true
        ON CONFLICT DO NOTHING;

        -- Create environment relations for API keys
        INSERT INTO customer_keys_relations (customer_key_id, entity_type, entity_id)
            SELECT
                ck.id                AS customer_key_id,
                'environment'        AS entity_type,
                s.environment_id     AS entity_id
            FROM api_secrets s
            JOIN _nango_environments e ON e.id = s.environment_id
            JOIN customer_keys ck
                ON  ck.hashed = s.hashed
                AND ck.account_id = e.account_id
                AND ck.key_type = 'api'
            WHERE s.is_default = true
        ON CONFLICT DO NOTHING;

        -- Copy default secrets as webhook signing keys (same secret value, different key_type)
        INSERT INTO customer_keys (account_id, key_type, display_name, scopes, secret, iv, tag, hashed, created_at, updated_at)
            SELECT
                e.account_id,
                'webhook_signing'                AS key_type,
                'Webhook signing'                AS display_name,
                NULL                             AS scopes,
                s.secret,
                s.iv,
                s.tag,
                -- hashed with a prefix to avoid collision with the API key row
                s.hashed || ':ws'                AS hashed,
                s.created_at,
                s.updated_at
            FROM api_secrets s
            JOIN _nango_environments e ON e.id = s.environment_id
            WHERE s.is_default = true
        ON CONFLICT DO NOTHING;

        -- Create environment relations for webhook signing keys
        INSERT INTO customer_keys_relations (customer_key_id, entity_type, entity_id)
            SELECT
                ck.id                AS customer_key_id,
                'environment'        AS entity_type,
                s.environment_id     AS entity_id
            FROM api_secrets s
            JOIN _nango_environments e ON e.id = s.environment_id
            JOIN customer_keys ck
                ON  ck.hashed = s.hashed || ':ws'
                AND ck.account_id = e.account_id
                AND ck.key_type = 'webhook_signing'
            WHERE s.is_default = true
        ON CONFLICT DO NOTHING;

        COMMIT;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`
        DELETE FROM customer_keys_relations;
        DELETE FROM customer_keys;
    `);
};

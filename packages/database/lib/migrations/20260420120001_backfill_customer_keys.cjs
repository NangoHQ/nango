exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // ON CONFLICT DO NOTHING: environments created between Step 2 (dual-read code deployed)
    // and this migration already have keys in customer_keys via createEnvironment.
    // The backfill skips those to avoid unique constraint violations.
    await knex.raw(`
        BEGIN;

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

        INSERT INTO customer_keys (account_id, key_type, display_name, scopes, secret, iv, tag, hashed, created_at, updated_at)
            SELECT
                e.account_id,
                'webhook_signing'                AS key_type,
                'Webhook signing'                AS display_name,
                NULL                             AS scopes,
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
                AND ck.key_type = 'webhook_signing'
            WHERE s.is_default = true
        ON CONFLICT DO NOTHING;

        COMMIT;
    `);
};

exports.down = function () {};

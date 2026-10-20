/**
 * Copy a live legacy signing key when it is newer than webhook_signing_keys, or the new row is missing.
 * Keeps the newest legacy row per environment. Rows already newer in webhook_signing_keys stay put.
 *
 * @param {import('knex').Knex} knex
 */
async function copyNewerWebhookSigningKeys(knex) {
    await knex.raw(`
        INSERT INTO webhook_signing_keys (environment_id, secret, iv, tag, created_at, updated_at)
        SELECT DISTINCT ON (relation.entity_id)
            relation.entity_id,
            customer_keys.secret,
            customer_keys.iv,
            customer_keys.tag,
            customer_keys.created_at,
            customer_keys.updated_at
        FROM customer_keys
        JOIN customer_keys_relations relation
          ON relation.customer_key_id = customer_keys.id
         AND relation.entity_type = 'environment'
        JOIN _nango_environments environment
          ON environment.id = relation.entity_id
        LEFT JOIN webhook_signing_keys existing
          ON existing.environment_id = relation.entity_id
        WHERE customer_keys.key_type = 'webhook_signing'
          AND customer_keys.deleted_at IS NULL
          AND (existing.environment_id IS NULL OR customer_keys.updated_at > existing.updated_at)
        ORDER BY relation.entity_id, customer_keys.updated_at DESC, customer_keys.id DESC
        ON CONFLICT (environment_id) DO UPDATE
        SET secret = EXCLUDED.secret,
            iv = EXCLUDED.iv,
            tag = EXCLUDED.tag,
            updated_at = EXCLUDED.updated_at
        WHERE webhook_signing_keys.updated_at < EXCLUDED.updated_at
    `);
}

/**
 * @param {import('knex').Knex} knex
 */
async function deleteWebhookSigningCustomerKeys(knex) {
    await knex.raw(`DELETE FROM customer_keys WHERE key_type = 'webhook_signing'`);
}

/**
 * Narrow key_type to 'api' without holding ACCESS EXCLUSIVE for the validation scan.
 *
 * @param {import('knex').Knex} knex
 */
async function narrowCustomerKeyTypeToApi(knex) {
    await knex.raw(`ALTER TABLE customer_keys DROP CONSTRAINT IF EXISTS check_customer_keys_key_type`);
    await knex.raw(`
        ALTER TABLE customer_keys
            ADD CONSTRAINT check_customer_keys_key_type
            CHECK (key_type IN ('api')) NOT VALID
    `);
    await knex.raw(`ALTER TABLE customer_keys VALIDATE CONSTRAINT check_customer_keys_key_type`);
}

module.exports = { copyNewerWebhookSigningKeys, deleteWebhookSigningCustomerKeys, narrowCustomerKeyTypeToApi };

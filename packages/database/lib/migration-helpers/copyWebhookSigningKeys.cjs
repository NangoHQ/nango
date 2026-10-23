/**
 * Copy live webhook signing keys into webhook_signing_keys.
 * Aborts when an environment has two live keys, or a relation points at a missing environment,
 * so the insert does not drop or pick a row on its own. Rows already present are left in place,
 * which is a no-op for the migration because it creates the empty table immediately before this runs.
 *
 * @param {import('knex').Knex} knex
 */
async function copyWebhookSigningKeys(knex) {
    const duplicates = await knex.raw(`
        SELECT relation.entity_id, count(*)::int AS live_keys
        FROM customer_keys
        JOIN customer_keys_relations relation
          ON relation.customer_key_id = customer_keys.id
         AND relation.entity_type = 'environment'
        WHERE customer_keys.key_type = 'webhook_signing'
          AND customer_keys.deleted_at IS NULL
        GROUP BY relation.entity_id
        HAVING count(*) > 1
    `);
    if (duplicates.rows.length > 0) {
        const environments = duplicates.rows.map((row) => row.entity_id).join(', ');
        throw new Error(`webhook signing keys are not unique per environment: ${environments}`);
    }

    const orphans = await knex.raw(`
        SELECT relation.entity_id
        FROM customer_keys
        JOIN customer_keys_relations relation
          ON relation.customer_key_id = customer_keys.id
         AND relation.entity_type = 'environment'
        LEFT JOIN _nango_environments environment
          ON environment.id = relation.entity_id
        WHERE customer_keys.key_type = 'webhook_signing'
          AND customer_keys.deleted_at IS NULL
          AND environment.id IS NULL
    `);
    if (orphans.rows.length > 0) {
        const environments = orphans.rows.map((row) => row.entity_id).join(', ');
        throw new Error(`webhook signing keys reference missing environments: ${environments}`);
    }

    await knex.raw(`
        INSERT INTO webhook_signing_keys (environment_id, secret, iv, tag, created_at, updated_at)
        SELECT relation.entity_id, customer_keys.secret, customer_keys.iv, customer_keys.tag, customer_keys.created_at, customer_keys.updated_at
        FROM customer_keys
        JOIN customer_keys_relations relation
          ON relation.customer_key_id = customer_keys.id
         AND relation.entity_type = 'environment'
        JOIN _nango_environments environment
          ON environment.id = relation.entity_id
        WHERE customer_keys.key_type = 'webhook_signing'
          AND customer_keys.deleted_at IS NULL
          AND NOT EXISTS (
              SELECT 1
              FROM webhook_signing_keys existing
              WHERE existing.environment_id = relation.entity_id
          )
    `);
}

module.exports = { copyWebhookSigningKeys };

/**
 * Move any existing per-connection webhook URL override out of `connection_config`
 * (which holds provider-declared, end-user-supplied inputs) into the dedicated
 * top-level `webhook_url_override` column, then strip the key from `connection_config`.
 *
 * Idempotent — connections that no longer carry `connection_config.webhook_url`
 * are skipped by the `jsonb_exists` WHERE clause.
 *
 * @param {import('knex').Knex} knex
 */
async function backfillWebhookUrlOverride(knex) {
    await knex.raw(`
        UPDATE _nango_connections
        SET webhook_url_override = NULLIF(TRIM(connection_config->>'webhook_url'), ''),
            connection_config = connection_config - 'webhook_url'
        WHERE jsonb_exists(connection_config, 'webhook_url')
    `);
}

module.exports = { backfillWebhookUrlOverride };

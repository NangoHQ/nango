// Not wrapped in a single transaction: the column adds each take a brief ACCESS EXCLUSIVE lock, but the
// backfill runs a full-table scan (no index on connection_config). Keeping them in one transaction would
// hold that exclusive lock on _nango_connections for the whole backfill. We commit the schema change first,
// then backfill separately so the scan runs without blocking reads/writes.
exports.config = { transaction: false };

/**
 * Moves the per-connection webhook URL override out of `connection_config` (which holds provider-declared,
 * end-user-supplied inputs) into a dedicated top-level `webhook_url_override` column on the connection.
 * Also adds `webhook_url_override` to `_nango_oauth_sessions` (so the OAuth flow can carry a session-set
 * override to the created connection) and to `connect_sessions` (the session-level input that sets it).
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('_nango_connections', (table) => {
        table.text('webhook_url_override').nullable();
    });
    await knex.schema.alterTable('_nango_oauth_sessions', (table) => {
        table.text('webhook_url_override').nullable();
    });
    await knex.schema.alterTable('connect_sessions', (table) => {
        table.text('webhook_url_override').nullable();
    });

    // Backfill: move any existing connection_config.webhook_url into the new column and strip the key.
    await knex.raw(`
        UPDATE _nango_connections
        SET webhook_url_override = NULLIF(TRIM(connection_config->>'webhook_url'), ''),
            connection_config = connection_config - 'webhook_url'
        WHERE jsonb_exists(connection_config, 'webhook_url')
    `);
};

exports.down = async function () {};

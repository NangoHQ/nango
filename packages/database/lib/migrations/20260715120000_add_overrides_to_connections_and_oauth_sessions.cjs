exports.config = { transaction: false };

/**
 * Moves the per-connection webhook URL override out of `connection_config` (which holds provider-declared,
 * end-user-supplied inputs) into a dedicated `overrides` object on the connection. Also adds `overrides` to
 * `_nango_oauth_sessions` so the OAuth flow can carry a session-set override to the created connection.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('_nango_connections', (table) => {
        table.jsonb('overrides').nullable();
    });
    await knex.schema.alterTable('_nango_oauth_sessions', (table) => {
        table.jsonb('overrides').nullable();
    });

    // Backfill: move any existing connection_config.webhook_url into overrides and strip the key.
    await knex.raw(`
        UPDATE _nango_connections
        SET overrides = CASE
                WHEN NULLIF(TRIM(connection_config->>'webhook_url'), '') IS NOT NULL
                THEN COALESCE(overrides, '{}'::jsonb) || jsonb_build_object('webhook_url', connection_config->>'webhook_url')
                ELSE overrides
            END,
            connection_config = connection_config - 'webhook_url'
        WHERE jsonb_exists(connection_config, 'webhook_url')
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('_nango_connections', (table) => {
        table.dropColumn('overrides');
    });
    await knex.schema.alterTable('_nango_oauth_sessions', (table) => {
        table.dropColumn('overrides');
    });
};

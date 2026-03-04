/**
 * Builds SQL to preview which connections will be migrated, capturing both
 * the original and new connection_id. Run this before the migration and save
 * the output to a file — it can be used as the basis for a manual rollback
 * if needed.
 *
 * Example usage:
 *   psql $DATABASE_URL -c "COPY (<query>) TO '/tmp/slack_migration_preview.csv' WITH CSV HEADER"
 */
function buildSlackConnectionIdPreviewSql() {
    const integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    const adminUUID = process.env['NANGO_ADMIN_UUID'];

    if (!adminUUID) {
        return `SELECT NULL AS id, NULL AS old_connection_id, NULL AS new_connection_id WHERE false;`;
    }

    return `
SELECT
    c.id,
    c.connection_id AS old_connection_id,
    'account-' || a.uuid || '-' || e.id::text AS new_connection_id
FROM _nango_connections AS c
JOIN _nango_environments AS e ON true
JOIN _nango_accounts AS a ON a.id = e.account_id
WHERE c.connection_id = 'account-' || a.uuid || '-' || e.name
  AND c.provider_config_key = '${integrationKey}'
  AND c.environment_id IN (
      SELECT e2.id
      FROM _nango_environments AS e2
      JOIN _nango_accounts AS a2 ON e2.account_id = a2.id
      WHERE a2.uuid = '${adminUUID}'
  )
  AND e.slack_notifications = true
  AND c.deleted = false
ORDER BY c.id
`;
}

/**
 * Builds SQL to migrate Slack notification connection IDs from the legacy
 * name-based format `account-{accountUUID}-{environmentName}` to the
 * ID-based format `account-{accountUUID}-{environmentId}`.
 *
 * Connections are stored in the admin account's environment, but the
 * connection_id encodes a customer account UUID and environment name.
 * The migration scopes updates to connections in admin environments
 * (via NANGO_ADMIN_UUID) while joining all accounts/environments to
 * resolve the customer reference in the connection_id.
 *
 * Returns a no-op if NANGO_ADMIN_UUID is not set (Slack notifications
 * not configured). Environments with purely numeric names are excluded
 * to avoid touching connections already in the new format.
 */
function buildSlackConnectionIdMigrationSql() {
    const integrationKey = process.env['NANGO_SLACK_INTEGRATION_KEY'] || 'slack';
    const adminUUID = process.env['NANGO_ADMIN_UUID'];

    if (!adminUUID) {
        return `SELECT 0 AS updated_rows;`;
    }

    return `
WITH updated AS (
    UPDATE _nango_connections AS c
    SET connection_id = 'account-' || a.uuid || '-' || e.id::text
    FROM _nango_environments AS e
    JOIN _nango_accounts AS a ON a.id = e.account_id
    WHERE c.connection_id = 'account-' || a.uuid || '-' || e.name
      AND c.provider_config_key = '${integrationKey}'
      AND c.environment_id IN (
          SELECT e2.id
          FROM _nango_environments AS e2
          JOIN _nango_accounts AS a2 ON e2.account_id = a2.id
          WHERE a2.uuid = '${adminUUID}'
      )
      AND e.slack_notifications = true
      AND c.deleted = false
    RETURNING c.id
)
SELECT
    (SELECT COUNT(*) FROM updated) AS updated_rows;
`;
}

/**
 * Rollback is intentionally a no-op.
 *
 * After deploying the dual-lookup (step 1), new Slack connections are created
 * directly in the new ID-based format. Once the migration (step 2) runs, both
 * migrated and freshly-created connections are indistinguishable in the DB.
 * Rolling back would incorrectly revert connections that were legitimately
 * created with the new format, breaking them.
 */
function buildSlackConnectionIdRollbackSql() {
    return `SELECT 0 AS updated_rows;`;
}

module.exports = {
    buildSlackConnectionIdMigrationSql,
    buildSlackConnectionIdPreviewSql,
    buildSlackConnectionIdRollbackSql
};

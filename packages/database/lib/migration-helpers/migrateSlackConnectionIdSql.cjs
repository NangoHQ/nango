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
        return null;
    }

    return `
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
`;
}

module.exports = {
    buildSlackConnectionIdMigrationSql
};

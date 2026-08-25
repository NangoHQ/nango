const LEGACY_SCOPES = [
    'environment:integrations:write',
    'environment:connections:write',
    'environment:syncs:manage',
    'environment:config:read',
    'environment:config:*'
];

/**
 * Strip the now-unused legacy scope strings from every customer API key.
 * Idempotent — keys that no longer carry any legacy scope are not touched
 * thanks to the `&&` overlap filter in the WHERE clause.
 *
 * Must run after the route layer has stopped accepting legacy scopes
 * (PR #6099) so that no live request relies on them.
 *
 * @param {import('knex').Knex} knex
 */
async function stripLegacyApiKeyScopes(knex) {
    await knex.raw(
        `
        UPDATE customer_keys
        SET scopes = ARRAY(
            SELECT s FROM unnest(scopes) AS s
            WHERE s <> ALL(?::text[])
        )
        WHERE key_type = 'api'
          AND scopes && ?::text[]
        `,
        [LEGACY_SCOPES, LEGACY_SCOPES]
    );
}

module.exports = { LEGACY_SCOPES, stripLegacyApiKeyScopes };

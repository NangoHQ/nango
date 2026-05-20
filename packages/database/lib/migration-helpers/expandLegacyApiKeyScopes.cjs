/**
 * Maps each legacy scope to the new fine-grained scopes that replace it.
 * Legacy scopes are kept on the keys for rollback safety; a follow-up
 * migration will strip them.
 */
const LEGACY_SCOPE_EXPANSIONS = [
    ['environment:integrations:write', ['environment:integrations:create', 'environment:integrations:update', 'environment:integrations:delete']],
    ['environment:connections:write', ['environment:connections:create', 'environment:connections:update', 'environment:connections:delete']],
    ['environment:syncs:manage', ['environment:syncs:update', 'environment:syncs:variant:create', 'environment:syncs:variant:delete']],
    ['environment:config:read', ['environment:variables:read', 'environment:integrations:list_functions']],
    ['environment:config:*', ['environment:variables:read', 'environment:integrations:list_functions']]
];

/**
 * Expand legacy scopes on existing customer API keys to include the new
 * fine-grained scopes alongside them. Idempotent — uses DISTINCT unnest so
 * keys that already have both legacy and new scopes are unaffected.
 *
 * @param {import('knex').Knex} knex
 */
async function expandLegacyApiKeyScopes(knex) {
    for (const [legacy, newScopes] of LEGACY_SCOPE_EXPANSIONS) {
        await knex.raw(
            `
            UPDATE customer_keys
            SET scopes = ARRAY(SELECT DISTINCT unnest(scopes || ?::text[]))
            WHERE key_type = 'api'
              AND ? = ANY(scopes)
            `,
            [newScopes, legacy]
        );
    }
}

module.exports = { LEGACY_SCOPE_EXPANSIONS, expandLegacyApiKeyScopes };

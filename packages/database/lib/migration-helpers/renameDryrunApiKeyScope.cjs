const OLD_SCOPE = 'environment:dryrun';
const NEW_SCOPE = 'environment:functions:dryrun';

/**
 * Rename the old dryrun API key scope to the functions-specific scope.
 * Idempotent, and dedupes keys that already have both values.
 *
 * @param {import('knex').Knex} knex
 */
async function renameDryrunApiKeyScope(knex) {
    await knex.raw(
        `
        WITH renamed AS (
            SELECT
                id,
                ARRAY(
                    SELECT scope
                    FROM (
                        SELECT
                            CASE
                                WHEN scope = ? THEN ?
                                ELSE scope
                            END AS scope,
                            MIN(ordinality) AS first_position
                        FROM unnest(scopes) WITH ORDINALITY AS current_scopes(scope, ordinality)
                        GROUP BY 1
                        ORDER BY first_position
                    ) deduped_scopes
                ) AS scopes
            FROM customer_keys
            WHERE key_type = 'api'
              AND ? = ANY(scopes)
        )
        UPDATE customer_keys
        SET
            scopes = renamed.scopes,
            updated_at = now()
        FROM renamed
        WHERE customer_keys.id = renamed.id
        `,
        [OLD_SCOPE, NEW_SCOPE, OLD_SCOPE]
    );
}

module.exports = { NEW_SCOPE, OLD_SCOPE, renameDryrunApiKeyScope };

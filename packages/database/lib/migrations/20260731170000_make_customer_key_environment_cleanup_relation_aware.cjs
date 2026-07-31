/**
 * Environment deletion used to delete every related customer key. That is only
 * correct while keys have exactly one environment relation. Remove the deleted
 * environment's relation first, then delete only keys that have no remaining
 * relation or account-level authority.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE OR REPLACE FUNCTION cleanup_customer_key_relations()
        RETURNS TRIGGER AS $$
        DECLARE
            affected_key_ids INTEGER[];
        BEGIN
            SELECT COALESCE(array_agg(customer_key_id), ARRAY[]::INTEGER[])
            INTO affected_key_ids
            FROM customer_keys_relations
            WHERE entity_type = TG_ARGV[0]
              AND entity_id = OLD.id;

            DELETE FROM customer_keys_relations
            WHERE entity_type = TG_ARGV[0]
              AND entity_id = OLD.id;

            DELETE FROM customer_keys AS customer_key
            WHERE customer_key.id = ANY(affected_key_ids)
              AND NOT EXISTS (
                  SELECT 1
                  FROM customer_keys_relations AS relation
                  WHERE relation.customer_key_id = customer_key.id
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM unnest(COALESCE(customer_key.scopes, ARRAY[]::TEXT[])) AS scope
                  WHERE scope LIKE 'account:%'
              );

            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    `);
};

exports.down = function () {};

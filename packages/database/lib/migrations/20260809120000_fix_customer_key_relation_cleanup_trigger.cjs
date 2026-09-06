exports.config = { transaction: true };

/**
 * Fixes cleanup_customer_key_relations() (introduced in 20260420120000_create_customer_keys.cjs):
 * it used to hard-delete a customer_keys row as soon as it found ANY relation to the entity
 * being removed, even if the key also had a surviving relation to a different, untouched
 * environment. That destroyed a shared key's access to every other environment it was related
 * to. It now only hard-deletes a key once the relation being removed was its last one, and
 * otherwise just removes that single relation row.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE OR REPLACE FUNCTION cleanup_customer_key_relations()
        RETURNS TRIGGER AS $$
        BEGIN
            -- Lock the affected customer_keys rows first (in a stable order) so that
            -- concurrently hard-deleting two environments that share a key serializes
            -- on the key, instead of each trigger invocation reading the other
            -- relation as still present (because the other transaction hasn't
            -- committed its removal yet) and both skipping the delete — which would
            -- leave the key alive with zero relations left.
            PERFORM 1 FROM customer_keys
            WHERE id IN (
                SELECT customer_key_id FROM customer_keys_relations
                WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id
            )
            ORDER BY id
            FOR UPDATE;

            -- Keys whose ONLY relation is the entity being removed get hard-deleted;
            -- ON DELETE CASCADE on customer_keys_relations.customer_key_id takes care
            -- of their relation row.
            DELETE FROM customer_keys
            WHERE id IN (
                SELECT customer_key_id FROM customer_keys_relations
                WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id
            )
            AND NOT EXISTS (
                SELECT 1 FROM customer_keys_relations other
                WHERE other.customer_key_id = customer_keys.id
                  AND (other.entity_type != TG_ARGV[0] OR other.entity_id != OLD.id)
            );

            -- Keys that survived (because they had another relation) just lose the
            -- relation to the entity being removed.
            DELETE FROM customer_keys_relations
            WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;

            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS customer_keys (
            id              SERIAL PRIMARY KEY,
            account_id      INTEGER NOT NULL REFERENCES _nango_accounts(id),
            key_type        VARCHAR(50) NOT NULL,
            display_name    VARCHAR(255) NOT NULL,
            scopes          TEXT[],
            secret          VARCHAR(255) NOT NULL,
            iv              VARCHAR(255) NOT NULL DEFAULT '',
            tag             VARCHAR(255) NOT NULL DEFAULT '',
            hashed          VARCHAR(255) NOT NULL,
            last_used_at    TIMESTAMPTZ,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at      TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS idx_customer_keys_account_id
            ON customer_keys (account_id);

        CREATE INDEX IF NOT EXISTS idx_customer_keys_hashed
            ON customer_keys (hashed);

        CREATE INDEX IF NOT EXISTS idx_customer_keys_key_type
            ON customer_keys (key_type);

        CREATE TABLE IF NOT EXISTS customer_keys_relations (
            customer_key_id INTEGER NOT NULL REFERENCES customer_keys(id) ON DELETE CASCADE,
            entity_type     VARCHAR(50) NOT NULL,
            entity_id       INTEGER NOT NULL,
            UNIQUE (customer_key_id, entity_type, entity_id)
        );

        CREATE INDEX IF NOT EXISTS idx_customer_keys_relations_entity
            ON customer_keys_relations (entity_type, entity_id);

        CREATE OR REPLACE FUNCTION cleanup_customer_key_relations()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM customer_keys_relations
            WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id;
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        CREATE TRIGGER trg_env_delete_customer_key_relations
            BEFORE DELETE ON _nango_environments
            FOR EACH ROW EXECUTE FUNCTION cleanup_customer_key_relations('environment');
    `);
};

exports.down = function () {};

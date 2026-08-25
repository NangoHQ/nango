exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS customer_keys (
            id              SERIAL PRIMARY KEY,
            account_id      INTEGER NOT NULL REFERENCES _nango_accounts(id) ON DELETE CASCADE,
            key_type        VARCHAR(50) NOT NULL
                            CONSTRAINT check_customer_keys_key_type CHECK (key_type IN ('api', 'webhook_signing')),
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

        -- Auth lookup by hash — unique per key_type to prevent ambiguous key resolution
        CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_keys_hashed_key_type
            ON customer_keys (hashed, key_type);

        -- Narrows key listing to account + type (avoids full table scan on future account-level queries)
        CREATE INDEX IF NOT EXISTS idx_customer_keys_account_key_type
            ON customer_keys (account_id, key_type);

        CREATE TABLE IF NOT EXISTS customer_keys_relations (
            customer_key_id INTEGER NOT NULL REFERENCES customer_keys(id) ON DELETE CASCADE,
            entity_type     VARCHAR(50) NOT NULL
                            CONSTRAINT check_customer_keys_relations_entity_type CHECK (entity_type IN ('environment', 'account')),
            entity_id       INTEGER NOT NULL,
            UNIQUE (customer_key_id, entity_type, entity_id)
        );

        -- Supports reverse lookups (entity → keys) used by the cleanup trigger on environment delete
        CREATE INDEX IF NOT EXISTS idx_customer_keys_relations_entity
            ON customer_keys_relations (entity_type, entity_id);

        CREATE OR REPLACE FUNCTION cleanup_customer_key_relations()
        RETURNS TRIGGER AS $$
        BEGIN
            DELETE FROM customer_keys
            WHERE id IN (
                SELECT customer_key_id FROM customer_keys_relations
                WHERE entity_type = TG_ARGV[0] AND entity_id = OLD.id
            );
            RETURN OLD;
        END;
        $$ LANGUAGE plpgsql;

        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_trigger WHERE tgname = 'trg_env_delete_customer_key_relations'
            ) THEN
                CREATE TRIGGER trg_env_delete_customer_key_relations
                    BEFORE DELETE ON _nango_environments
                    FOR EACH ROW EXECUTE FUNCTION cleanup_customer_key_relations('environment');
            END IF;
        END $$;
    `);
};

exports.down = function () {};

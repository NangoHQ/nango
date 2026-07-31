/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE _nango_configs
            ADD CONSTRAINT _nango_configs_id_environment_id_unique UNIQUE (id, environment_id);

        CREATE TABLE IF NOT EXISTS function_configs (
            id                   INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            nango_config_id      INTEGER NOT NULL,
            environment_id       INTEGER NOT NULL,
            name                 TEXT NOT NULL,
            current_version_id   INTEGER,
            enabled              BOOLEAN NOT NULL DEFAULT TRUE,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at           TIMESTAMPTZ,
            CONSTRAINT function_configs_nango_config_environment_fkey
                FOREIGN KEY (nango_config_id, environment_id)
                REFERENCES _nango_configs(id, environment_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS function_configs_nango_config_id_idx
            ON function_configs (nango_config_id);

        CREATE INDEX IF NOT EXISTS function_configs_environment_id_idx
            ON function_configs (environment_id);

        CREATE INDEX IF NOT EXISTS function_configs_current_version_id_idx
            ON function_configs (current_version_id);

        CREATE UNIQUE INDEX IF NOT EXISTS function_configs_unique_idx
            ON function_configs (nango_config_id, name)
            WHERE deleted_at IS NULL;

        CREATE TABLE IF NOT EXISTS function_config_versions (
            id                  INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            function_config_id  INTEGER NOT NULL REFERENCES function_configs(id) ON DELETE CASCADE,
            description         TEXT NOT NULL,
            file_location       TEXT NOT NULL,
            version             TEXT NOT NULL,
            source              TEXT NOT NULL CONSTRAINT function_config_versions_source_check CHECK (source IN ('catalog', 'standalone', 'repo')),
            trigger             JSONB NOT NULL,
            requires            JSONB NOT NULL,
            capabilities        JSONB NOT NULL,
            limits              JSONB NOT NULL,
            input_schema_ref    TEXT,
            output_schema_ref   TEXT,
            model_schema_refs   TEXT[] NOT NULL,
            metadata_schema_ref TEXT,
            checkpoint_schema_ref TEXT,
            json_schema         JSONB NOT NULL,
            created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at          TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS function_config_versions_function_config_id_idx
            ON function_config_versions (function_config_id);

        CREATE UNIQUE INDEX IF NOT EXISTS function_config_versions_config_version_unique_idx
            ON function_config_versions (function_config_id, version)
            WHERE deleted_at IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS function_config_versions_id_config_unique_idx
            ON function_config_versions (id, function_config_id);

        ALTER TABLE function_configs
            ADD CONSTRAINT function_configs_current_version_id_fkey
            FOREIGN KEY (current_version_id, id) REFERENCES function_config_versions(id, function_config_id)
            ON DELETE SET NULL (current_version_id) DEFERRABLE INITIALLY DEFERRED;

        CREATE TABLE IF NOT EXISTS function_instances (
            id                    INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            nango_connection_id   INTEGER NOT NULL REFERENCES _nango_connections(id) ON DELETE CASCADE,
            function_config_id    INTEGER NOT NULL REFERENCES function_configs(id) ON DELETE CASCADE,
            name                  TEXT NOT NULL,
            variant               VARCHAR(255) NOT NULL DEFAULT 'base',
            last_run_at           TIMESTAMPTZ,
            frequency             TEXT,
            created_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            deleted_at            TIMESTAMPTZ
        );

        CREATE INDEX IF NOT EXISTS function_instances_connection_id_idx
            ON function_instances (nango_connection_id);

        CREATE INDEX IF NOT EXISTS function_instances_function_config_id_idx
            ON function_instances (function_config_id);

        CREATE UNIQUE INDEX IF NOT EXISTS function_instances_config_connection_variant_unique_idx
            ON function_instances (function_config_id, nango_connection_id, variant)
            WHERE deleted_at IS NULL;

        CREATE UNIQUE INDEX IF NOT EXISTS function_instances_id_config_unique_idx
            ON function_instances (id, function_config_id);
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

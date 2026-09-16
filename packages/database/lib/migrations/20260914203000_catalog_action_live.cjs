exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE "_nango_configs"
            ADD COLUMN IF NOT EXISTS "auto_enable_catalog_actions" boolean NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS "catalog_action_overrides" jsonb NOT NULL DEFAULT '{}'::jsonb
    `);
};

exports.down = async function () {
    // Keep membership columns; dropping them would lose per-integration catalog overrides.
};

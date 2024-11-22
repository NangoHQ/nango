exports.up = async function (knex) {
    await knex.schema.raw(`
        ALTER TABLE "_nango_configs" 
        ADD COLUMN IF NOT EXISTS "missing_fields" text[] NOT NULL DEFAULT array[]::text[];
    `);
};

exports.down = async function (knex) {
    await knex.schema.raw(`
        ALTER TABLE "_nango_configs"
        DROP COLUMN "missing_fields";
    `);
};

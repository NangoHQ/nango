exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE _nango_environments ADD COLUMN otlp_settings JSONB DEFAULT NULL;`);
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_environment_otlp_settings" ON "_nango_environments" USING BTREE ("id") WHERE "otlp_settings" IS NOT NULL;`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`ALTER TABLE _nango_environments DROP COLUMN otlp_settings;`);
    await knex.schema.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_environment_otlp_settings"`);
};

exports.config = { transaction: false };

const TABLE = '_nango_sync_jobs';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE ${TABLE} ADD COLUMN IF NOT EXISTS "log_id" varchar(64) NULL`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`ALTER TABLE ${TABLE} DROP COLUMN IF EXISTS "log_id"`);
};

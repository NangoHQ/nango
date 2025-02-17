exports.config = { transaction: false };

const TABLE = '_nango_syncs';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "variant" varchar(255) NOT NULL DEFAULT 'base'
    `);
    await knex.schema.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "_nango_syncs_variant_name_nango_connection_id_deleted_at_unique"
        ON "${TABLE}" ("variant", "name", "nango_connection_id", "deleted_at")
    `);
};

exports.down = function () {
    // do nothing
};

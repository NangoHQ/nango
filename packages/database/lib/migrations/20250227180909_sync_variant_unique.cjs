exports.config = { transaction: false };

const TABLE = '_nango_syncs';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "${TABLE}" DROP CONSTRAINT IF EXISTS "_nango_syncs_name_nango_connection_id_deleted_at_unique";`);
    await knex.schema.raw(`DROP INDEX CONCURRENTLY IF EXISTS "_nango_syncs_variant_name_nango_connection_id_deleted_at_unique"`);
    await knex.schema.raw(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "_nango_syncs_variant_name_nango_connection"
        ON "${TABLE}" ("variant", "name", "nango_connection_id")
        WHERE deleted_at IS NULL;
    `);
};

exports.down = function () {
    // do nothing
};

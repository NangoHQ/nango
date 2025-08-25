exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Soft-delete all connections referenced in getting_started_progress
    await knex('_nango_connections')
        .whereIn('id', function () {
            this.select('connection_id').from('getting_started_progress').whereNotNull('connection_id');
        })
        .update({
            deleted: true,
            deleted_at: knex.fn.now()
        });

    // Hard-delete all getting_started_progress records
    await knex('getting_started_progress').del();

    // Soft-delete all configs referenced in getting_started_meta
    await knex('_nango_configs')
        .whereIn('id', function () {
            this.select('integration_id').from('getting_started_meta');
        })
        .update({
            deleted: true,
            deleted_at: knex.fn.now()
        });

    // Hard-delete all getting_started_meta records
    await knex('getting_started_meta').del();
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

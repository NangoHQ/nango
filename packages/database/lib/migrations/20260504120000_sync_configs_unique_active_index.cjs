/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // Deactivate duplicate active configs before adding the unique index.
    // Keeps the most recently created row per (environment_id, nango_config_id, sync_name, type)
    // and marks all older duplicates inactive so the index creation doesn't fail.
    await knex.raw(`
        UPDATE _nango_sync_configs
        SET active = false
        WHERE active = true
          AND deleted = false
          AND id NOT IN (
              SELECT DISTINCT ON (environment_id, nango_config_id, sync_name, type) id
              FROM _nango_sync_configs
              WHERE active = true AND deleted = false
              ORDER BY environment_id, nango_config_id, sync_name, type, created_at DESC
          )
    `);

    await knex.raw(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_configs_unique_active
        ON _nango_sync_configs (environment_id, nango_config_id, sync_name, type)
        WHERE active = true AND deleted = false
    `);
};

exports.down = function () {};

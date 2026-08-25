/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    // fix: soft-delete syncs when sync config is disabled or doesn't exist anymore
    await knex.raw(`
        UPDATE _nango_syncs s
        SET deleted = true,
            deleted_at = CURRENT_TIMESTAMP
        WHERE s.deleted = false
        AND NOT EXISTS (
            SELECT 1 FROM _nango_sync_configs sc
            WHERE sc.id = s.sync_config_id
            AND sc.deleted = false
            AND sc.enabled = true
        );
    `);
};

exports.down = async function () {};

exports.config = { transaction: true };

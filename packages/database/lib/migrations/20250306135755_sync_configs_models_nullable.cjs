/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs ALTER COLUMN models SET NOT NULL`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE _nango_sync_configs ALTER COLUMN models DROP NOT NULL`);
};

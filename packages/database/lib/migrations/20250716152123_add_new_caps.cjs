exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN monthly_actions_max INTEGER DEFAULT 1000;`);
    await knex.raw(`ALTER TABLE plans ADD COLUMN monthly_active_records_max INTEGER DEFAULT 5000;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE plans DROP COLUMN monthly_actions_max;`);
    await knex.raw(`ALTER TABLE plans DROP COLUMN monthly_active_records_max;`);
};

exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE plans ADD COLUMN IF NOT EXISTS data_transfer_max BIGINT`);
    await knex('plans').where('name', 'free').update({ data_transfer_max: 10_000_000_000 });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function () {};

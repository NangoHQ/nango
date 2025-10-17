exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS webhook_forwards_max INTEGER
    `);

    // set default value for existing free plans
    await knex.raw(`
        UPDATE plans
        SET
            webhook_forwards_max = 100000
        WHERE name = 'free'
    `);
};

exports.down = async function () {};

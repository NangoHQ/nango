exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        ALTER TABLE plans
        ADD COLUMN IF NOT EXISTS node_routing_override varchar(255) DEFAULT NULL;
    `);
};

exports.down = async function () {};

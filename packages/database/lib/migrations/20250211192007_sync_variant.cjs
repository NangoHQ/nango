const TABLE = '_nango_syncs';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        ALTER TABLE "${TABLE}"
        ADD COLUMN IF NOT EXISTS "variant" varchar(255) NOT NULL DEFAULT 'base'
    `);
};

exports.down = function () {
    // do nothing
};

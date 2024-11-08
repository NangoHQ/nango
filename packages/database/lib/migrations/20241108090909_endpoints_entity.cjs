exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "_nango_sync_endpoints" ADD COLUMN "entity" varchar(64)`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "_nango_sync_endpoints" DROP COLUMN "entity"`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_sync_configs" ADD COLUMN "sdk_version" varchar(25)`);
    await knex.raw(`ALTER TABLE "on_event_scripts" ADD COLUMN "sdk_version" varchar(25)`);
};

exports.down = function () {};

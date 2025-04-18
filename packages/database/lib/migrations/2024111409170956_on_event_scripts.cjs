exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        CREATE TYPE script_trigger_event AS ENUM (
            'ON_CONNECTION_CREATED',
            'ON_CONNECTION_DELETED'
        );
    `);
    await knex.schema.raw(`ALTER TABLE "_nango_post_connection_scripts" RENAME TO "on_event_scripts"`);
    await knex.schema.raw(`ALTER TABLE "on_event_scripts" ADD COLUMN "event" script_trigger_event DEFAULT 'ON_CONNECTION_CREATED'`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "on_event_scripts" DROP COLUMN "event"`);
    await knex.schema.raw(`ALTER TABLE "on_event_scripts" RENAME TO "_nango_post_connection_scripts"`);
    await knex.schema.raw(`DROP TYPE IF EXISTS script_trigger_event`);
};

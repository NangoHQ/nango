exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`
        ALTER TYPE script_trigger_event RENAME VALUE 'ON_CONNECTION_CREATED' TO 'POST_CONNECTION_CREATION';
    `);
    await knex.schema.raw(`
        ALTER TYPE script_trigger_event RENAME VALUE 'ON_CONNECTION_DELETED' TO 'PRE_CONNECTION_DELETION';
    `);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`
        ALTER TYPE script_trigger_event RENAME VALUE 'POST_CONNECTION_CREATION' TO 'ON_CONNECTION_CREATED';
    `);
    await knex.schema.raw(`
        ALTER TYPE script_trigger_event RENAME VALUE 'PRE_CONNECTION_DELETION' TO 'ON_CONNECTION_DELETED';
    `);
};

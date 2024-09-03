const CONNECTION_TOKEN_COLUMN = 'connection_token';
const CONNECTION_ID_COLUMN = 'connection_id';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "_nango_connections" ADD COLUMN "${CONNECTION_TOKEN_COLUMN}" uuid NULL UNIQUE;`);
    await knex.schema.raw(`ALTER TABLE "_nango_connections" ALTER COLUMN "${CONNECTION_ID_COLUMN}" DROP NOT NULL;`);
    await knex.schema.raw(`ALTER TABLE "_nango_oauth_sessions" ADD COLUMN "${CONNECTION_TOKEN_COLUMN}" uuid NULL UNIQUE;`);
    await knex.schema.raw(`ALTER TABLE "_nango_oauth_sessions" ALTER COLUMN "${CONNECTION_ID_COLUMN}" DROP NOT NULL;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`ALTER TABLE "_nango_connections" DROP COLUMN "${CONNECTION_TOKEN_COLUMN}"`);
    await knex.schema.raw(`ALTER TABLE "_nango_connections" ALTER COLUMN "${CONNECTION_ID_COLUMN}" SET NOT NULL;`);
    await knex.schema.raw(`ALTER TABLE "_nango_oauth_sessions" DROP COLUMN "${CONNECTION_TOKEN_COLUMN}"`);
    await knex.schema.raw(`ALTER TABLE "_nango_oauth_sessions" ALTER COLUMN "${CONNECTION_ID_COLUMN}" SET NOT NULL;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_connections"
ADD COLUMN "credentials_expires_at" timestamptz,
ADD COLUMN "last_refresh_success" timestamptz,
ADD COLUMN "last_refresh_failure" timestamptz,
ADD COLUMN "last_refresh_tries" int2,
ADD COLUMN "refreshable" bool`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_connections"
DROP COLUMN "credentials_expires_at",
DROP COLUMN "last_refresh_success",
DROP COLUMN "last_refresh_failure",
DROP COLUMN "last_refresh_tries",
DROP COLUMN "refreshable"`);
};

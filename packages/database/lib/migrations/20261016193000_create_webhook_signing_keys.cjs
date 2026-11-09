const { copyWebhookSigningKeys } = require('../migration-helpers/copyWebhookSigningKeys.cjs');

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE webhook_signing_keys (
            environment_id  INTEGER PRIMARY KEY REFERENCES _nango_environments(id) ON DELETE CASCADE,
            secret          VARCHAR(255) NOT NULL,
            iv              VARCHAR(255) NOT NULL DEFAULT '',
            tag             VARCHAR(255) NOT NULL DEFAULT '',
            created_at      TIMESTAMPTZ NOT NULL,
            updated_at      TIMESTAMPTZ NOT NULL
        )
    `);

    await copyWebhookSigningKeys(knex);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw('DROP TABLE IF EXISTS webhook_signing_keys');
};

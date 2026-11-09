exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`
        CREATE TABLE IF NOT EXISTS account_getting_started (
            account_id                INTEGER PRIMARY KEY REFERENCES _nango_accounts(id) ON DELETE CASCADE,
            first_agent_connection_at TIMESTAMPTZ,
            first_tool_call_at        TIMESTAMPTZ,
            dismissed_at              TIMESTAMPTZ,
            created_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at                TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    `);
};

exports.down = async function () {};

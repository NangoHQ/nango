exports.config = { transaction: true };

const tableName = 'account_getting_started';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    if (await knex.schema.hasTable(tableName)) {
        return;
    }

    await knex.schema.createTable(tableName, (table) => {
        table.integer('account_id').primary().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.timestamp('first_agent_connection_at', { useTz: true }).nullable();
        table.timestamp('first_tool_call_at', { useTz: true }).nullable();
        table.timestamp('dismissed_at', { useTz: true }).nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
};

exports.down = async function () {};

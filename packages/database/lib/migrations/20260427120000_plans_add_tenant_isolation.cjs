/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('lambda_tenant_isolation').notNullable().defaultTo(false);
    });
};

exports.down = async function () {};

exports.config = { transaction: true };

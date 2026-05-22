/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.boolean('export_runner_telemetry').notNullable().defaultTo(false);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.alterTable('plans', (table) => {
        table.dropColumn('export_runner_telemetry');
    });
};

exports.config = { transaction: true };

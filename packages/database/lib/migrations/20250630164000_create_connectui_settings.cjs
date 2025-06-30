exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('connectui_settings', (table) => {
        table.increments('id').primary();
        table.integer('environment_id').unsigned().notNullable();
        table.string('primary_color').nullable();
        table.timestamps(true, true);

        table.foreign('environment_id').references('id').inTable('_nango_environments').onDelete('CASCADE');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('connectui_settings');
};

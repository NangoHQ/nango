exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('usage', (table) => {
        table.increments('id').primary();
        table.integer('accountId').unsigned().notNullable();
        table.date('month').notNullable();
        table.integer('actions').unsigned().notNullable().defaultTo(0);
        table.integer('active_records').unsigned().notNullable().defaultTo(0);
        table.timestamps(true, true);

        table.foreign('accountId').references('id').inTable('_nango_accounts').onDelete('CASCADE');

        table.unique(['accountId', 'month']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('usage');
};

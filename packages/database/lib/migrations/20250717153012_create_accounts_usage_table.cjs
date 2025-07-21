exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('accounts_usage', (table) => {
        table.increments('id').primary();
        table.integer('account_id').unsigned().notNullable();
        table.date('month').notNullable();
        table.integer('actions').unsigned().notNullable().defaultTo(0);
        table.integer('active_records').unsigned().notNullable().defaultTo(0);
        table.timestamps(true, true);

        table.foreign('account_id').references('id').inTable('_nango_accounts').onDelete('CASCADE');

        table.unique(['account_id', 'month']);
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('accounts_usage');
};

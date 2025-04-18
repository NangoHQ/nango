const DB_TABLE = '_nango_onboarding_demo_progress';

exports.up = async function (knex) {
    return knex.schema.createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.integer('user_id').unsigned().references('id').inTable(`_nango_users`).index();
        table.integer('progress').index();
        table.boolean('complete');
        table.timestamps(true, true);
    });
};

exports.down = async function (knex) {
    return knex.schema.dropTable(DB_TABLE);
};

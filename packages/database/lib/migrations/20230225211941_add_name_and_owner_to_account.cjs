exports.up = async function (knex) {
    await knex
        .from(`_nango_users`)
        .insert({ id: 0, name: 'unknown', email: 'unknown@example.com', hashed_password: 'unkown', salt: 'unknown', account_id: 0 })
        .onConflict(['id'])
        .merge();
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.integer('owner_id').references('id').inTable('_nango_users').defaultTo(0).notNullable();
        table.string('name').notNullable().defaultTo('My Organization');
        table.dropColumn('email');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.dropColumn('owner_id');
        table.dropColumn('name');
        table.string('email').notNullable().defaultTo('unknown');
    });
};

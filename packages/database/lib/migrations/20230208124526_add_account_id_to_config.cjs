exports.up = async function (knex) {
    await knex.from(`_nango_accounts`).insert({ email: 'self-hosted', id: 0 }).onConflict(['id']).merge();
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.integer('account_id').references('id').inTable('_nango_accounts').defaultTo(0).notNullable();
        table.dropUnique('unique_key');
        table.unique(['unique_key', 'account_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.dropUnique(['unique_key', 'account_id']);
        table.unique('unique_key');
        table.dropColumn('account_id');
    });
};

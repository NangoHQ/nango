exports.up = async function (knex, _) {
    const prodId = await knex.withSchema('nango').table('_nango_environments').insert(
        { name: 'prod' },
    ).returning('id');

    await knex.withSchema('nango').table('_nango_environments').insert(
        { name: 'dev' },
    );

    await knex.schema.withSchema('nango').alterTable('_nango_accounts', function (table) {
        table.integer('environment_id').unsigned().references('id').inTable('nango._nango_environments');
    });

    return knex.withSchema('nango').table('_nango_accounts').update(
        { environment_id: prodId[0].id },
    );
};

exports.down = async function (knex, _) {
    await knex.withSchema('nango').table('_nango_environments').truncate();

    return knex.schema.withSchema('nango').table('_nango_accounts').alterTable(function (table) {
        table.dropColumn('environment_id');
    });
};

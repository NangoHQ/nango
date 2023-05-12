exports.up = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_accounts', function (table) {
        table.string('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).alter({ alterType: true });
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_accounts', function (table) {
        table.uuid('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).alter({ alterType: true });
    });
};

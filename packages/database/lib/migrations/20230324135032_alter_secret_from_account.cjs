exports.up = function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.string('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).alter({ alterType: true });
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.uuid('secret_key').defaultTo(knex.raw('uuid_generate_v4()')).alter({ alterType: true });
    });
};

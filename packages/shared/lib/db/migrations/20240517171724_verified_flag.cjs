exports.up = async function (knex, _) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.boolean('email_verified').defaultTo(true);
        table.string('email_verification_token').nullable();
        table.uuid('uuid').notNullable().defaultTo(knex.raw('uuid_generate_v4()'));
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.dropColumn('email_verified');
        table.dropColumn('email_verification_token');
        table.dropColumn('uuid');
    });
};

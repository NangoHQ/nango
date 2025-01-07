exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.boolean('email_verified').defaultTo(true);
        table.string('email_verification_token').nullable();
        table.uuid('uuid').notNullable().defaultTo(knex.raw('uuid_generate_v4()'));
        table.dateTime('email_verification_token_expires_at');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.dropColumn('email_verified');
        table.dropColumn('email_verification_token');
        table.dropColumn('uuid');
        table.dropColumn('email_verification_token_expires_at');
    });
};

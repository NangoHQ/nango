exports.up = async function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_users', function (table) {
        table.string('reset_password_token');
    });
};

exports.down = function (knex, _) {
    return knex.schema.withSchema('nango').alterTable('_nango_users', function (table) {
        table.dropColumn('reset_password_token');
    });
};

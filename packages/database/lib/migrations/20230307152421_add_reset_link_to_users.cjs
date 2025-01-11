exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.string('reset_password_token');
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_users', function (table) {
        table.dropColumn('reset_password_token');
    });
};

exports.up = async function (knex, _) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.string('secret_key_iv');
        table.string('secret_key_tag');
    });
};

exports.down = function (knex, _) {
    return knex.schema.alterTable('_nango_accounts', function (table) {
        table.dropColumn('secret_key_iv');
        table.dropColumn('secret_key_tag');
    });
};

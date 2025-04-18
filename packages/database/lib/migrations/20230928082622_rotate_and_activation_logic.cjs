const tableName = '_nango_environments';

exports.up = function (knex) {
    return knex.schema.alterTable(tableName, function (table) {
        table.string('pending_secret_key').nullable();
        table.unique('pending_secret_key');
        table.string('pending_secret_key_iv');
        table.string('pending_secret_key_tag');

        table.string('pending_public_key').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.table(tableName, function (table) {
        table.dropColumn('pending_secret_key');
        table.dropColumn('pending_secret_key_iv');
        table.dropColumn('pending_secret_key_tag');

        table.dropColumn('pending_public_key');
    });
};

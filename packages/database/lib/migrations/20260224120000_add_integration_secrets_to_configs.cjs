exports.up = async function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.jsonb('integration_secrets').nullable();
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable('_nango_configs', function (table) {
        table.dropColumn('integration_secrets');
    });
};

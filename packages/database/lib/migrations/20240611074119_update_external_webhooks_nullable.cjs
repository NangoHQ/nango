const TABLE = '_nango_external_webhooks';

exports.up = function (knex) {
    return knex.schema.alterTable(TABLE, function (t) {
        t.string('primary_url').nullable().alter();
        t.string('secondary_url').nullable().alter();
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(TABLE, function (t) {
        t.string('primary_url').notNullable().alter();
        t.string('secondary_url').notNullable().alter();
    });
};

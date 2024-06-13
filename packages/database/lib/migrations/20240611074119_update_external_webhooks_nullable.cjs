const TABLE = '_nango_external_webhooks';

exports.up = function (knex) {
    return knex.schema.alterTable(TABLE, function (t) {
        t.string('primary_url').nullable().alter();
        t.string('secondary_url').nullable().alter();
        t.renameColumn('on_auth_refesh_error', 'on_auth_refresh_error');
        t.unique(['environment_id']);
    });
};

exports.down = function (knex) {
    return knex.schema.alterTable(TABLE, function (t) {
        t.string('primary_url').notNullable().alter();
        t.string('secondary_url').notNullable().alter();
        t.renameColumn('on_auth_refresh_error', 'on_auth_refesh_error');
        t.dropUnique(['environment_id']);
    });
};

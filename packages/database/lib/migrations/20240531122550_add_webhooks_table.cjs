const DB_TABLE = '_nango_external_webhooks';

exports.up = async function (knex) {
    return knex.schema.createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.integer('environment_id').unsigned().notNullable();
        table.foreign('environment_id').references('id').inTable('_nango_environments').onDelete('CASCADE');
        table.string('primary_url').notNullable();
        table.string('secondary_url').notNullable();
        table.boolean('on_sync_completion_always').defaultTo(false);
        table.boolean('on_auth_creation').defaultTo(false);
        table.boolean('on_auth_refesh_error').defaultTo(false);
        table.boolean('on_sync_error').defaultTo(false);
        table.timestamps(true, true);
    });
};

exports.down = async function (knex) {
    return knex.schema.dropTable(DB_TABLE);
};

const TABLE_NAME = '_nango_post_connection_scripts';

exports.up = function (knex) {
    return knex.schema.createTable(TABLE_NAME, function (table) {
        table.increments('id').primary();
        table.integer('config_id').unsigned().notNullable();
        table.foreign('config_id').references('id').inTable('_nango_configs').onDelete('CASCADE');
        table.text('name').notNullable();
        table.text('file_location').notNullable();
        table.string('version', 255).notNullable();
        table.boolean('active').defaultTo(true);
        table.timestamps(true, true);
    });
};

exports.down = function (knex) {
    return knex.schema.dropTable(TABLE_NAME);
};

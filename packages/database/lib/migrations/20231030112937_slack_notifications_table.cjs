const DB_TABLE = '_nango_slack_notifications';

exports.up = async function (knex) {
    return knex.schema.createTable(DB_TABLE, function (table) {
        table.increments('id').primary();
        table.boolean('open').defaultTo(true).index();
        table.integer('environment_id').unsigned().references('id').inTable(`_nango_environments`).index();
        table.string('name').index();
        table.string('type');
        table.specificType('connection_list', 'integer ARRAY');
        table.string('slack_timestamp');
        table.string('admin_slack_timestamp');
        table.timestamps(true, true);
    });
};

exports.down = async function (knex) {
    return knex.schema.dropTable(DB_TABLE);
};

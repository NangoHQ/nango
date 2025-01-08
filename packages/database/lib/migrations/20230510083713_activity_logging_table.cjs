const tableName = '_nango_activity_logs';
const messagesTableName = '_nango_activity_log_messages';

exports.up = function (knex) {
    return knex.schema
        .createTable(tableName, function (table) {
            table.increments('id').primary();
            table.integer('account_id').unsigned().notNullable().index();
            table.enu('level', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).defaultTo('info').notNullable();
            table.enu('action', ['oauth', 'proxy', 'token', 'sync']).defaultTo('oauth').notNullable();
            table.boolean('success');
            table.bigInteger('timestamp');
            table.bigInteger('start');
            table.bigInteger('end');
            table.text('endpoint');
            table.string('provider_config_key');
            table.string('connection_id');
            table.string('provider');
            table.enum('method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
            table.string('session_id');
            table.timestamps(true, true);

            table.foreign('account_id').references('id').inTable('_nango_accounts').onDelete('CASCADE');
        })
        .then(() => {
            return knex.schema.createTable(messagesTableName, function (table) {
                table.increments('id').primary();
                table.integer('activity_log_id').unsigned().notNullable();
                table.enu('level', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).defaultTo('info').notNullable();
                table.text('content');
                table.bigInteger('timestamp');
                table.jsonb('params');
                table.timestamps(true, true);
                table.string('auth_mode');
                table.text('url');
                table.string('state');

                table.foreign('activity_log_id').references('id').inTable(tableName).onDelete('CASCADE');
            });
        });
};

exports.down = function (knex) {
    return knex.schema.dropTable(messagesTableName).then(() => {
        return knex.schema.dropTable(tableName);
    });
};

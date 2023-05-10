const tableName = '_nango_activity_logs';
const messagesTableName = '_nango_activity_log_messages';

exports.up = function (knex, _) {
    return knex.schema
        .withSchema('nango')
        .createTable(tableName, function (table) {
            table.increments('id').primary();
            table.integer('account_id').unsigned().notNullable();
            table.integer('connection_id').unsigned();
            table.enu('log_level', ['error', 'warn', 'info', 'http', 'verbose', 'debug', 'silly']).defaultTo('info').notNullable();
            table.enu('action', ['oauth', 'proxy', 'token', 'sync']).defaultTo('oauth').notNullable();
            table.boolean('success');
            table.dateTime('timestamp').defaultTo(knex.fn.now()).notNullable();
            table.dateTime('start').defaultTo(knex.fn.now()).notNullable();
            table.dateTime('end');
            table.string('provider_config_key');
            table.string('connection_id');
            table.string('provider');
            table.enum('method', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
            table.string('session_id');

            table.foreign('account_id').references('id').inTable('nango._nango_accounts').onDelete('CASCADE');
        })
        .then(() => {
            return knex.schema.withSchema('nango').createTable(messagesTableName, function (table) {
                table.increments('id').primary();
                table.integer('activity_log_id').unsigned().notNullable();
                table.string('content');
                table.dateTime('timestamp').defaultTo(knex.fn.now()).notNullable();
                table.foreign('activity_log_id').references('id').inTable(tableName).onDelete('CASCADE');
                table.jsonb('params');
                table.timestamps(true, true);
            });
        });
};

exports.down = function (knex, _) {
    return knex.schema
        .withSchema('nango')
        .dropTable(messagesTableName)
        .then(() => {
            return knex.schema.withSchema('nango').dropTable(tableName);
        });
};

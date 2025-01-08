const LOG_MESSAGES_TABLE = '_nango_activity_log_messages';

exports.up = async function (knex) {
    return knex.schema.alterTable(LOG_MESSAGES_TABLE, function (table) {
        table.index('activity_log_id', 'activity_log_id_index');
        table.index('created_at', 'created_at_index');
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(LOG_MESSAGES_TABLE, function (table) {
        table.dropIndex('activity_log_id', 'activity_log_id_index');
        table.dropIndex('created_at', 'created_at_index');
    });
};

exports.config = { transaction: false };

exports.up = async function (knex) {
    // logs
    // This index does not exists in Prod
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS created_at_index');
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_logs_environment_timestamp');

    // log_messages
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_activity_log_messages_environment_id_index');

    // Records Deletes
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_sync_data_records_deletes_created_at_index');
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_sync_data_records_deletes_updated_at_index');
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_sync_data_records_deletes_nango_connection_id_index');

    // Connections
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_connections_connection_id_index');

    // Jobs
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS _nango_sync_jobs_status_index');
};

exports.down = function () {};

exports.config = { transaction: false };

exports.up = function () {
    return Promise.resolve();
    /*
     * Production only migration
    return knex.schema
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_data_hash_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_sync_job_id_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_external_is_deleted_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_external_deleted_at_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_deletes_data_hash_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_deletes_sync_job_id_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_deletes_external_is_deleted_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_data_records_deletes_external_deleted_at_index')
        .raw('DROP INDEX CONCURRENTLY _nango_sync_jobs_deleted_index');
    */
};

exports.down = function () {
    return Promise.resolve();
};

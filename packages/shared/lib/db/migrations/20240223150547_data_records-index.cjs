exports.config = { transaction: false };

exports.up = async function (knex) {
    // Drop test index that was indeed not useful enough
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_records_created_id_connection_model');

    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_records_connection_model_externalid" ON "nango"."_nango_sync_data_records" USING BTREE ("nango_connection_id","model","external_id")'
    );
};

exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_records_connection_model_externalid');
};

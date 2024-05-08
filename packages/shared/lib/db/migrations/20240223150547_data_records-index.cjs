exports.config = { transaction: false };

const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = async function (knex) {
    // Drop test index that was indeed not useful enough
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_records_created_id_connection_model"`);

    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY "idx_records_connection_model_externalid" ON "${schema}"."_nango_sync_data_records" USING BTREE ("nango_connection_id","model","external_id")`
    );
};

exports.down = async function (knex) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_records_connection_model_externalid"`);
};

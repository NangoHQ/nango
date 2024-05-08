exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = async function (knex) {
    await knex.schema.raw(`CREATE UNIQUE INDEX CONCURRENTLY "idx_records_id_pkey" ON "${schema}"."_nango_sync_data_records" USING BTREE ("id")`);
};

exports.down = async function (knex) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_records_id_pkey"`);
};

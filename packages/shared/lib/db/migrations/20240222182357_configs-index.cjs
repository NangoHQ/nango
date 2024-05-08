exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = function (knex) {
    return knex.schema.raw(
        `CREATE INDEX "idx_configs_environmentid_uniquekey_deleted" ON "${schema}"."_nango_configs" USING BTREE ("environment_id","unique_key") WHERE deleted = false`
    );
};

exports.down = function (knex) {
    return knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_configs_environmentid_uniquekey_deleted"`);
};

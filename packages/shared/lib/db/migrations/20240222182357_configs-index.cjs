exports.config = { transaction: false };

exports.up = function (knex) {
    return knex.schema.raw(
        'CREATE INDEX "idx_configs_environmentid_uniquekey_deleted" ON "nango"."_nango_configs" USING BTREE ("environment_id","unique_key") WHERE deleted = false'
    );
};

exports.down = function (knex) {
    return knex.schema.raw('DROP INDEX CONCURRENTLY idx_configs_environmentid_uniquekey_deleted');
};

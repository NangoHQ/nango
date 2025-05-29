exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nango_sync_endpoints_sync_config_id" ON _nango_sync_endpoints USING BTREE ("sync_config_id")'
    );
};

exports.down = async function () {};

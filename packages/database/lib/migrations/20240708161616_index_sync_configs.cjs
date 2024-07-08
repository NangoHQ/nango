exports.config = { transaction: false };

exports.up = async function (knex, _) {
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY idx_nango_sync_configs_sync_name_active ON _nango_sync_configs USING BTREE (sync_name) WHERE active = true`
    );
};

exports.down = async function (knex, _) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_nango_sync_configs_sync_name_active');
};

exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX "idx_connections_envid_connectionid_provider_where_deleted" ON "_nango_connections" USING BTREE ("environment_id","connection_id","provider_config_key") WHERE deleted=false'
    );
};

exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_connections_envid_connectionid_provider_where_deleted');
};

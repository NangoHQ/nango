exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_connections_connectionid_envid_provider_where_deleted" ON "nango"."_nango_connections" USING BTREE ("connection_id","environment_id","provider_config_key") WHERE deleted=false'
    );

    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_connections_envid_where_deleted" ON "nango"."_nango_connections" USING BTREE ("environment_id") WHERE deleted=false'
    );
};

exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_connections_connectionid_envid_provider_where_deleted');
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_connections_envid_where_deleted');
};

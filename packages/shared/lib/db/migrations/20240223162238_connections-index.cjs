exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = async function (knex) {
    await knex.schema.raw(
        `CREATE INDEX "idx_connections_envid_connectionid_provider_where_deleted" ON "${schema}"."_nango_connections" USING BTREE ("environment_id","connection_id","provider_config_key") WHERE deleted=false`
    );
};

exports.down = async function (knex) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}"."idx_connections_envid_connectionid_provider_where_deleted"`);
};

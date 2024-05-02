exports.up = async function (knex, _) {
    await knex.schema.raw(
        'CREATE INDEX "idx_connectionid_name_where_deleted" ON "_nango_syncs" USING BTREE ("nango_connection_id", "name") WHERE deleted = false'
    );
    await knex.schema.raw('CREATE INDEX "idx_id_where_deleted" ON "_nango_syncs" USING BTREE ("id") WHERE deleted = false');
};

exports.down = async function (knex, _) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_connectionid_name_where_deleted');
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_id_where_deleted');
};

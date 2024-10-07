exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "idx_sync_id_active_true"`);
    await knex.schema.raw(`CREATE INDEX CONCURRENTLY "idx_activelogs_type_connectionid" ON "_nango_active_logs" USING BTREE ("type","connection_id","active")`);
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY "idx_activelogs_connectionid_where_active" ON "_nango_active_logs" USING BTREE ("connection_id") WHERE (active=true)`
    );
    await knex.schema.raw(`CREATE INDEX CONCURRENTLY "idx_activelogs_type_syncid" ON "_nango_active_logs" USING BTREE ("type","sync_id","active")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw('CREATE INDEX CONCURRENTLY "idx_sync_id_active_true" ON "_nango_active_logs" USING BTREE ("sync_id") WHERE active = true');
    await knex.schema.raw(`DROP CONCURRENTLY "idx_activelogs_type_connectionid" ON "_nango_active_logs" USING BTREE ("type","connection_id","active")`);
    await knex.schema.raw(
        `DROP CONCURRENTLY "idx_activelogs_connectionid_where_active" ON "_nango_active_logs" USING BTREE ("connection_id") WHERE (active=true)`
    );
    await knex.schema.raw(`DROP CONCURRENTLY "idx_activelogs_type_syncid" ON "_nango_active_logs" USING BTREE ("type","sync_id","active")`);
};

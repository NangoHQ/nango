exports.config = { transaction: false };

exports.up = async function (knex, _) {
    await knex.schema.raw('CREATE INDEX CONCURRENTLY "idx_sync_id_active_true" ON "_nango_ui_notifications" USING BTREE ("sync_id") WHERE active = true');
};

exports.down = async function (knex, _) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_sync_id_active_true');
};

exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_active_config_id_name" ON "_nango_post_connection_scripts" USING BTREE ("config_id", "name") WHERE active = true'
    );
};

exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_active_config_id_name');
};

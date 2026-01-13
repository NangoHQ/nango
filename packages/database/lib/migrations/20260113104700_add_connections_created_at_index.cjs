exports.config = { transaction: false };

exports.up = async function (knex) {
    await knex.schema.raw(
        'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_connections_env_createdat_not_deleted ON _nango_connections (environment_id, created_at DESC) WHERE NOT deleted;'
    );
};

exports.down = async function () {};

exports.config = { transaction: false };

exports.up = function (knex) {
    return knex.schema.raw(
        'CREATE INDEX CONCURRENTLY "idx_logs_environment_timestamp" ON "_nango_activity_logs" USING BTREE ("environment_id","timestamp" DESC NULLS LAST)'
    );
};

exports.down = function (knex) {
    return knex.schema.raw('DROP INDEX CONCURRENTLY idx_logs_environment_timestamp');
};

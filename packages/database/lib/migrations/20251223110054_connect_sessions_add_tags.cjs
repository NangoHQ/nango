exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable('connect_sessions', (table) => {
        table.jsonb('tags').nullable();
    });
    await knex.schema.alterTable('_nango_connections', (table) => {
        table.jsonb('tags').nullable();
    });

    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_connect_sessions_tags" ON "connect_sessions" USING GIN ("tags")`);
    await knex.raw(`CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_nango_connections_tags" ON "_nango_connections" USING GIN ("tags")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_connect_sessions_tags"`);
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "idx_nango_connections_tags"`);

    await knex.schema.alterTable('connect_sessions', (table) => {
        table.dropColumn('tags');
    });
    await knex.schema.alterTable('_nango_connections', (table) => {
        table.dropColumn('tags');
    });
};

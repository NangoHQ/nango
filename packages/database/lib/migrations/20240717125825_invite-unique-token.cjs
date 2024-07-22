exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`CREATE UNIQUE INDEX "idx_invited_token_uniq" ON "_nango_invited_users" USING BTREE ("token")`);
    await knex.schema.raw(
        `CREATE INDEX "idx_invited_token_expires_where_accepted" ON "_nango_invited_users" USING BTREE ("token","expires_at") WHERE accepted = false`
    );
    await knex.schema.raw(
        `CREATE INDEX "idx_invited_accountid_expires_where_accepted" ON "_nango_invited_users" USING BTREE ("account_id","expires_at") WHERE accepted = false`
    );
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_invited_token_uniq');
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_invited_token_expires_where_accepted');
    await knex.schema.raw('DROP INDEX CONCURRENTLY IF EXISTS idx_invited_accountid_expires_where_accepted');
};

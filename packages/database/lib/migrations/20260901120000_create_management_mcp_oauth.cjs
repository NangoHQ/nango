exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('_nango_mcp_oauth_provider_artifacts', (table) => {
        table.text('model').notNullable();
        table.text('artifact_id_hash').notNullable();
        table.text('artifact_id_encrypted').notNullable();
        table.jsonb('payload').notNullable();
        table.timestamp('expires_at', { useTz: true }).nullable();
        table.timestamp('consumed_at', { useTz: true }).nullable();
        table.text('grant_id').nullable();
        table.text('session_uid').nullable();
        table.text('user_code').nullable();
        table.timestamps(true, true);

        table.primary(['model', 'artifact_id_hash']);
        table.index(['grant_id'], 'idx_mcp_oauth_artifacts_grant_id');
        table.index(['model', 'session_uid'], 'idx_mcp_oauth_artifacts_session_uid');
        table.index(['model', 'user_code'], 'idx_mcp_oauth_artifacts_user_code');
        table.index(['expires_at'], 'idx_mcp_oauth_artifacts_expires_at');
    });

    await knex.schema.createTable('_nango_mcp_oauth_grants', (table) => {
        table.text('grant_id').primary();
        table.integer('user_id').notNullable().references('id').inTable('_nango_users').onDelete('CASCADE');
        table.integer('account_id').notNullable().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.text('client_id').notNullable();
        table.text('resource').notNullable();
        table.specificType('scopes', 'text[]').notNullable();
        table.text('status').notNullable();
        table.timestamp('revoked_at', { useTz: true }).nullable();
        table.timestamps(true, true);

        table.index(['user_id'], 'idx_mcp_oauth_grants_user_id');
        table.index(['account_id'], 'idx_mcp_oauth_grants_account_id');
        table.index(['client_id'], 'idx_mcp_oauth_grants_client_id');
        table.check("status in ('pending', 'active', 'revoked')", [], 'chk_mcp_oauth_grants_status');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('_nango_mcp_oauth_grants');
    await knex.schema.dropTableIfExists('_nango_mcp_oauth_provider_artifacts');
};

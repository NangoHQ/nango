exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable('_nango_mcp_oauth_grant_environments', (table) => {
        table.text('grant_id').notNullable().references('grant_id').inTable('_nango_mcp_oauth_grants').onDelete('CASCADE');
        table.integer('environment_id').notNullable().references('id').inTable('_nango_environments').onDelete('CASCADE');
        table.timestamps(true, true);

        table.primary(['grant_id', 'environment_id']);
        table.index(['environment_id'], 'idx_mcp_oauth_grant_environments_environment_id');
    });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.dropTableIfExists('_nango_mcp_oauth_grant_environments');
};

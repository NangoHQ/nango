exports.config = { transaction: true };

const grantsTable = 'oauth_product_grants';
const resourcesTable = 'oauth_product_grant_resources';
const handoffsTable = 'oauth_login_handoffs';
const interactionsTable = 'oauth_consent_interactions';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.createTable(grantsTable, (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.binary('provider_grant_id_hash').notNullable().unique();
        table.binary('client_id_hash').notNullable();
        table.integer('user_id').notNullable().references('id').inTable('_nango_users').onDelete('CASCADE');
        table.integer('account_id').notNullable().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.text('status').notNullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('activated_at', { useTz: true }).nullable();
        table.timestamp('revoked_at', { useTz: true }).nullable();
        table.text('revocation_reason').nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        table.check("status in ('pending', 'active', 'revoked')", [], 'oauth_product_grants_status_check');
        table.index(['user_id', 'status'], 'oauth_product_grants_user_status_idx');
        table.index(['account_id', 'status'], 'oauth_product_grants_account_status_idx');
        table.index(['status', 'created_at'], 'oauth_product_grants_pending_cleanup_idx');
    });

    await knex.schema.createTable(resourcesTable, (table) => {
        table.bigIncrements('id').primary();
        table.uuid('grant_id').notNullable().references('id').inTable(grantsTable).onDelete('CASCADE');
        table.text('resource').notNullable();
        table.specificType('scopes', 'text[]').notNullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        table.unique(['grant_id', 'resource'], { indexName: 'oauth_product_grant_resources_unique' });
        table.index(['resource'], 'oauth_product_grant_resources_resource_idx');
    });

    await knex.schema.createTable(handoffsTable, (table) => {
        table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
        table.binary('state_hash').notNullable().unique();
        table.binary('code_hash').nullable().unique();
        table.binary('interaction_uid_hash').notNullable();
        table.text('issuer').notNullable();
        table.text('return_destination').notNullable();
        table.integer('user_id').nullable().references('id').inTable('_nango_users').onDelete('CASCADE');
        table.integer('account_id').nullable().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('issued_at', { useTz: true }).nullable();
        table.timestamp('consumed_at', { useTz: true }).nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        table.index(['expires_at'], 'oauth_login_handoffs_expires_at_idx');
        table.index(['interaction_uid_hash'], 'oauth_login_handoffs_interaction_idx');
    });

    await knex.schema.createTable(interactionsTable, (table) => {
        table.binary('interaction_uid_hash').primary();
        table.binary('csrf_token_hash').notNullable();
        table.integer('user_id').notNullable().references('id').inTable('_nango_users').onDelete('CASCADE');
        table.integer('account_id').notNullable().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.text('status').notNullable().defaultTo('pending');
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('completed_at', { useTz: true }).nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        table.check("status in ('pending', 'processing', 'approved', 'denied')", [], 'oauth_consent_interactions_status_check');
        table.index(['expires_at'], 'oauth_consent_interactions_expires_at_idx');
    });
};

exports.down = async function () {
    // Deliberately preserve product grants and interaction state during a code rollback.
};

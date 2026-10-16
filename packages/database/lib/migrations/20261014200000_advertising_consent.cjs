exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    // down intentionally retains these tables, so reapplying must be safe.
    if (!(await knex.schema.hasTable('advertising_consents'))) {
        await knex.schema.createTable('advertising_consents', (table) => {
            table.uuid('id').primary();
            table.string('owner_hash', 64).notNullable().unique();
            table.jsonb('choice').notNullable();
            table.integer('revision').notNullable();
            table.jsonb('click_context').notNullable();
            table.timestamp('observed_at', { useTz: true }).notNullable();
            table.timestamp('invalidated_at', { useTz: true }).nullable();
            table.timestamp('expires_at', { useTz: true }).notNullable().index();
            table.timestamps(true, true);
        });
    }
    if (!(await knex.schema.hasTable('signup_advertising_consents'))) {
        await knex.schema.createTable('signup_advertising_consents', (table) => {
            table.integer('account_id').primary().references('id').inTable('_nango_accounts').onDelete('CASCADE');
            table.uuid('consent_id').notNullable().references('id').inTable('advertising_consents').onDelete('CASCADE').index();
            table.integer('consent_revision').notNullable();
            table.uuid('signup_id').notNullable().unique();
            table.integer('creator_user_id').nullable().references('id').inTable('_nango_users').onDelete('CASCADE');
            table.boolean('creator_is_internal').nullable();
            table.jsonb('click_context').notNullable();
            table.timestamp('expires_at', { useTz: true }).notNullable().index();
            table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        });
    }
};

// Retain choices and withdrawals on code rollback. Retirement/deletion is a separate operation.
exports.down = async function () {};

exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    if (await knex.schema.hasTable('signup_ad_conversions')) return;
    await knex.schema.createTable('signup_ad_conversions', (table) => {
        table.integer('account_id').notNullable().references('id').inTable('_nango_accounts').onDelete('CASCADE');
        table.string('platform', 16).notNullable();
        table.primary(['account_id', 'platform']);
        table.string('destination', 256).notNullable();
        table.string('status', 16).notNullable().defaultTo('pending');
        table.integer('attempts').notNullable().defaultTo(0);
        table.timestamp('signup_at', { useTz: true }).notNullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('next_attempt_at', { useTz: true }).notNullable();
        table.uuid('lease_id').nullable();
        table.timestamp('lease_until', { useTz: true }).nullable();
        table.string('reason', 40).nullable();
        table.string('receipt_id', 512).nullable();
        table.timestamp('submitted_at', { useTz: true }).nullable();
        table.timestamps(true, true);
        table.index(['platform', 'status', 'next_attempt_at']);
    });
};

// Keep delivery deduplication on rollback, as with retained consent choices.
exports.down = async function () {};

exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_accounts" ADD COLUMN IF NOT EXISTS "has_baa" bool NOT NULL DEFAULT false`);
};

exports.down = async function () {};

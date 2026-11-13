exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "providers_shared_credentials" ADD COLUMN IF NOT EXISTS "enabled" bool NOT NULL DEFAULT true`);
};

exports.down = async function () {};

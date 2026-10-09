exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans" ADD COLUMN IF NOT EXISTS "has_overdue_invoices_banner" bool NOT NULL DEFAULT true`);
    await knex.raw(`UPDATE "plans" SET "has_overdue_invoices_banner" = false WHERE "name" IN ('enterprise', 'enterprise-cloud-hosted')`);
};

exports.down = async function () {};

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "_nango_accounts" ADD COLUMN IF NOT EXISTS "workos_organization_id" varchar(255)`);
    await knex.raw(`CREATE UNIQUE INDEX IF NOT EXISTS "accounts_workos_organization_id_unique" ON "_nango_accounts" ("workos_organization_id")`);
};

exports.down = async function () {};

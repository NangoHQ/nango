/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(
        `CREATE TABLE "plans" (
	"id" serial,
	"account_id" int4 NOT NULL REFERENCES _nango_accounts(id) ON DELETE CASCADE,
	"created_at" timestamptz DEFAULT NOW(),
	"updated_at" timestamptz DEFAULT NOW(),
	"name" varchar(256) NOT NULL,
	"trial_start_at" timestamptz,
	"trial_end_at" timestamptz,
	"trial_extension_count" int2 DEFAULT 0,
	"trial_end_notified_at" timestamptz,
	"max_connection_with_scripts" int2 DEFAULT 3,
	"max_environments" int2 DEFAULT 2,
	"min_sync_frequency" int4 DEFAULT 86400,
	"has_sync_variants" bool DEFAULT false,
	PRIMARY KEY ("id")
)`
    );
    await knex.raw(`CREATE UNIQUE INDEX "idx_account_id" ON "plans" USING BTREE ("account_id")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`DROP TABLE "plans"`);
};

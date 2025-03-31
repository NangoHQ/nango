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
	"trial_extension_count" int2 NOT NULL DEFAULT 0,
	"trial_end_notified_at" timestamptz,
	"connection_with_scripts_max" int2 DEFAULT 3,
	"environments_max" int2 DEFAULT 2,
	"sync_frequency_secs_min" int4 NOT NULL DEFAULT 86400,
	"has_sync_variants" bool NOT NULL DEFAULT false,
	"has_otel" bool NOT NULL DEFAULT false,
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

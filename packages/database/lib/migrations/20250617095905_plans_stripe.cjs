/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans"
ADD COLUMN "stripe_customer_id" varchar(256),
ADD COLUMN "stripe_payment_id" varchar(256),
ADD COLUMN "orb_customer_id" varchar(256),
ADD COLUMN "orb_subscription_id" varchar(256),
ADD COLUMN "orb_future_plan" varchar(256),
ADD COLUMN "orb_future_plan_at" timestamptz;`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    //
};

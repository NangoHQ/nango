/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw(`ALTER TABLE "plans"
ADD COLUMN "stripe_customer_id" varchar(256),
ADD COLUMN "stripe_subscription_id" varchar(256)`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = function () {
    //
};

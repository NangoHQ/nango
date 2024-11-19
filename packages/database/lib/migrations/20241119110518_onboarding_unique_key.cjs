exports.config = { transaction: false };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.raw(`DROP INDEX "_nango_onboarding_demo_progress_user_id_index"`);
    await knex.schema.raw(`CREATE UNIQUE INDEX "_nango_onboarding_demo_progress_user_id_index" ON "_nango_onboarding_demo_progress" USING BTREE ("user_id")`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.schema.raw(`DROP INDEX "_nango_onboarding_demo_progress_user_id_index"`);
    await knex.schema.raw(`CREATE INDEX "_nango_onboarding_demo_progress_user_id_index" ON "_nango_onboarding_demo_progress" USING BTREE ("user_id")`);
};

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`UPDATE plans SET environments_max = 10, updated_at = NOW() WHERE has_growth_features = true AND environments_max < 10`);
};

exports.down = async function () {};

exports.config = { transaction: true };

const artifactsTable = 'oauth_server_artifacts';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable(artifactsTable, (table) => {
        table.binary('user_id_hash').nullable();
        table.timestamp('user_authenticated_at', { useTz: true }).nullable();
        table.index(['model', 'user_id_hash'], 'oauth_artifacts_model_user_idx');
    });
};

exports.down = async function () {
    // Deliberately preserve OAuth revocation state during a code rollback.
};

exports.config = { transaction: true };

const tableName = 'oauth_server_artifacts';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.alterTable(tableName, (table) => {
        table.binary('subject_id_hash').nullable();
        table.timestamp('session_authenticated_at', { useTz: true }).nullable();
        table.index(['model', 'subject_id_hash'], 'oauth_artifacts_model_subject_idx');
    });
};

exports.down = async function () {
    // Deliberately preserve OAuth session revocation state during a code rollback.
};

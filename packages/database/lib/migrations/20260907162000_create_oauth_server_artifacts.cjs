exports.config = { transaction: true };

const tableName = 'oauth_server_artifacts';

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    if (await knex.schema.hasTable(tableName)) {
        return;
    }

    await knex.schema.createTable(tableName, (table) => {
        table.bigIncrements('id').primary();
        table.text('model').notNullable();
        table.binary('artifact_id_hash').notNullable();
        table.binary('payload_encrypted').notNullable();
        table.binary('grant_id_hash').nullable();
        table.binary('session_uid_hash').nullable();
        table.timestamp('expires_at', { useTz: true }).notNullable();
        table.timestamp('consumed_at', { useTz: true }).nullable();
        table.timestamp('revoked_at', { useTz: true }).nullable();
        table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
        table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

        table.unique(['model', 'artifact_id_hash'], {
            indexName: 'oauth_artifacts_model_id_unique'
        });
        table.index(['expires_at'], 'oauth_artifacts_expires_at_idx');
        table.index(['grant_id_hash'], 'oauth_artifacts_grant_idx');
        table.index(['model', 'session_uid_hash'], 'oauth_artifacts_model_session_idx');
    });
};

exports.down = async function () {
    // Deliberately preserve OAuth grants and tokens during a code rollback.
};

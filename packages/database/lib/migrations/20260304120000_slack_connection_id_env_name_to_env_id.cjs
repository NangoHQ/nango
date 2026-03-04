exports.config = { transaction: true };

const { buildSlackConnectionIdMigrationSql, buildSlackConnectionIdRollbackSql } = require('../migration-helpers/migrateSlackConnectionIdSql.cjs');

exports.up = async function (knex) {
    const result = await knex.raw(buildSlackConnectionIdMigrationSql());
    const summary = result?.rows?.[0];
    if (summary) {
        console.log('[slack connection id migration] summary', summary);
    }
};

exports.down = async function (knex) {
    const result = await knex.raw(buildSlackConnectionIdRollbackSql());
    const summary = result?.rows?.[0];
    if (summary) {
        console.log('[slack connection id rollback] summary', summary);
    }
};

exports.config = { transaction: true };

const { buildSlackConnectionIdMigrationSql } = require('../migration-helpers/migrateSlackConnectionIdSql.cjs');

exports.up = async function (knex) {
    const sql = buildSlackConnectionIdMigrationSql();
    if (!sql) {
        console.log('[slack connection id migration] skipped: NANGO_ADMIN_UUID not set');
        return;
    }
    const result = await knex.raw(sql);
    console.log('[slack connection id migration] updated rows:', result.rowCount);
};

exports.down = async function () {
    console.log('[slack connection id rollback] no-op');
};

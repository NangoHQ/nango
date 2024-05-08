exports.config = { transaction: false };
const schema = process.env['NANGO_DB_SCHEMA'] || 'nango';

exports.up = async function (knex, _) {
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_environments_accountid_name" ON "${schema}"."_nango_environments" USING BTREE ("account_id","name")`
    );
    await knex.schema.raw(
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_environments_secretkeyhashed" ON "${schema}"."_nango_environments" USING BTREE ("secret_key_hashed")`
    );
};

exports.down = async function (knex, _) {
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}".idx_environments_accountid_name`);
    await knex.schema.raw(`DROP INDEX CONCURRENTLY "${schema}".idx_environments_secretkeyhashed`);
};

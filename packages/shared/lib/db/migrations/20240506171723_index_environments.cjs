exports.config = { transaction: false };

exports.up = async function (knex, _) {
    await knex.schema.raw('CREATE INDEX CONCURRENTLY "idx_environments_accountid_name" ON "_nango_environments" USING BTREE ("account_id","name")');
    await knex.schema.raw('CREATE INDEX CONCURRENTLY "idx_environments_secretkeyhashed" ON "_nango_environments" USING BTREE ("secret_key_hashed")');
};

exports.down = async function (knex, _) {
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_environments_accountid_name');
    await knex.schema.raw('DROP INDEX CONCURRENTLY idx_environments_secretkeyhashed');
};

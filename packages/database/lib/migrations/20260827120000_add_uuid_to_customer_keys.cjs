/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.raw('ALTER TABLE customer_keys ADD COLUMN IF NOT EXISTS uuid UUID');
    await knex('customer_keys')
        .whereNull('uuid')
        .update({ uuid: knex.raw('uuid_generate_v4()') });
    await knex.raw('ALTER TABLE customer_keys ALTER COLUMN uuid SET NOT NULL, ALTER COLUMN uuid SET DEFAULT uuid_generate_v4()');
    await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS customer_keys_uuid_unique ON customer_keys (uuid)');
};

exports.down = async function () {};

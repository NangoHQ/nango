exports.config = { transaction: true };

/** @param {import('knex').Knex} knex */
exports.up = async function (knex) {
    await knex.raw(`
        UPDATE customer_keys
        SET scopes = (
            SELECT array_agg(DISTINCT CASE WHEN scope IN ('environment:actions:execute', 'environment:actions:*') THEN 'environment:tools:call' ELSE scope END)
            FROM unnest(scopes) AS scope
        )
        WHERE scopes && ARRAY['environment:actions:execute', 'environment:actions:*']::text[]
    `);
};

exports.down = async function () {};

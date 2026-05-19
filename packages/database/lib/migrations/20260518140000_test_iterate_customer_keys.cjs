exports.config = { transaction: false };

/**
 * Diagnostic migration — reads every row in customer_keys and does nothing
 * else. Used to bisect a slow-deploy issue: if THIS migration is slow on a
 * dev deploy with ~1.3K rows, the problem is reading the table at migration
 * time (locks, bloat, connection setup), not the legacy-scope UPDATEs.
 *
 * Logs the row count and elapsed read time to make the deploy log conclusive.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    const startedAt = Date.now();
    const rows = await knex('customer_keys').select('id', 'key_type', 'scopes');

    let counted = 0;
    for (let i = 0; i < rows.length; i++) {
        counted++;
    }

    const elapsedMs = Date.now() - startedAt;
    // eslint-disable-next-line no-console
    console.log(`[diagnostic] iterated ${counted} customer_keys rows in ${elapsedMs}ms`);
};

exports.down = function () {};

exports.config = { transaction: false };

const INDEX_NAME = 'idx_nango_users_email_lower';

/**
 * Enforces case-insensitive email uniqueness via a unique index on LOWER(email).
 *
 * Skips creation when the table already contains case-insensitive email duplicates
 * (possible on existing self-hosted instances) so the migration never fails on boot
 * and no user data is deleted or mutated. New duplicates are prevented at the
 * application layer regardless; instances that resolve their duplicates can be
 * enforced by a later migration.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    const {
        rows: [{ has_conflicts: hasConflicts }]
    } = await knex.raw(
        `SELECT EXISTS (
            SELECT 1 FROM "_nango_users" GROUP BY LOWER("email") HAVING COUNT(*) > 1
        ) AS has_conflicts`
    );

    if (hasConflicts) {
        console.warn(
            `[migration] "_nango_users" contains case-insensitive email duplicates; skipping the unique index on LOWER(email). ` +
                `Resolve the duplicates to enforce case-insensitive email uniqueness at the database level.`
        );
        return;
    }

    await knex.raw(`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "${INDEX_NAME}" ON "_nango_users" (LOWER("email"))`);
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function (knex) {
    await knex.raw(`DROP INDEX CONCURRENTLY IF EXISTS "${INDEX_NAME}"`);
};

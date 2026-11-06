exports.config = { transaction: true };

/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function (knex) {
    await knex.schema.dropTableIfExists('getting_started_progress');
    await knex.schema.dropTableIfExists('getting_started_meta');

    if (await knex.schema.hasColumn('_nango_users', 'getting_started_closed')) {
        await knex.schema.alterTable('_nango_users', (table) => {
            table.dropColumn('getting_started_closed');
        });
    }
};

exports.down = async function () {};

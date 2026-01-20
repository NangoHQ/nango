const TABLE_NAME = '_nango_environment_variables';

/**
 * Increase the size of name and value columns for environment variables.
 *
 * The API validation allows:
 * - name: up to 256 characters
 * - value: up to 4000 characters
 *
 * But the database was using varchar(255) for both columns,
 * causing "value too long for type character varying(255)" errors.
 *
 * This migration changes:
 * - name: varchar(255) -> varchar(256) to match API validation
 * - value: varchar(255) -> text to accommodate large values up to 4000 chars
 */

exports.up = async function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.string('name', 256).notNullable().alter({ alterType: true });
        table.text('value').notNullable().alter({ alterType: true });
    });
};

exports.down = async function (knex) {
    return knex.schema.alterTable(TABLE_NAME, function (table) {
        table.string('name', 255).notNullable().alter({ alterType: true });
        table.string('value', 255).notNullable().alter({ alterType: true });
    });
};

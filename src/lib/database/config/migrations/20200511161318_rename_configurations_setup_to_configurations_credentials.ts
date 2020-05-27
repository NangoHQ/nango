import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  return knex.schema.alterTable('configurations', function(table) {
    table.renameColumn('setup', 'credentials')
  })
}

export async function down(knex: Knex): Promise<any> {
  return knex.schema.alterTable('configurations', function(table) {
    table.renameColumn('credentials', 'setup')
  })
}

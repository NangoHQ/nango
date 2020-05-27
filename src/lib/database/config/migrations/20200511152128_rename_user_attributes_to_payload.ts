import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  return knex.schema.alterTable('authentications', function(table) {
    table.renameColumn('user_attributes', 'payload')
  })
}

export async function down(knex: Knex): Promise<any> {
  return knex.schema.alterTable('authentications', function(table) {
    table.renameColumn('payload', 'user_attributes')
  })
}

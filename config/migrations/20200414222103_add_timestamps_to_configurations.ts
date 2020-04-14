import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.alterTable('configuration', function(table) {
    table.timestamps(true, true)
  })
}

export async function down(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.alterTable('configuration', function(table) {
    table.dropTimestamps()
  })
}

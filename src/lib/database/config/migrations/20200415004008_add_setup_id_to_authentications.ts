import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.alterTable('authentications', function(table) {
    table.string('setup-id')
  })
}

export async function down(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.alterTable('authentications', function(table) {
    table.dropColumn('setup-id')
  })
}

import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.createTable('authentications', function(t) {
    t.bigIncrements('id')
    t.string('buid')
    t.string('auth_id')
    t.json('user_attributes')
  })
}

export async function down(knex: Knex): Promise<any> {
  return knex.schema.dropTable('authentications')
}

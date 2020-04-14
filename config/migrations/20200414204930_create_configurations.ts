import * as Knex from 'knex'

export async function up(knex: Knex): Promise<any> {
  // tslint:disable-next-line:ter-prefer-arrow-callback
  return knex.schema.createTable('configurations', function(t) {
    t.bigIncrements('id')
    t.string('buid')
    t.string('setup_id')
    t.json('setup')
    t.specificType('scopes', 'text ARRAY')
  })
}

export async function down(knex: Knex): Promise<any> {
  return knex.schema.dropTable('configurations')
}

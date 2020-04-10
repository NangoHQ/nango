import knex from 'knex'
import { connection } from './constants'

export const dbClient = function() {
  return knex({
    connection,
    client: 'pg'
  })
}

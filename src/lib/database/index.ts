import knex from 'knex'
import { connection } from '../../../config/constants'

export const dbClient = function() {
  return knex({
    connection,
    client: 'pg',
    pool: {
      min: 2,
      max: 5
    }
  })
}

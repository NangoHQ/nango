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

export const store = dbClient()
export const initializeDB = function(req, _res, next) {
  req.store = store
  next()
}

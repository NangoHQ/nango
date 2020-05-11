import knex from 'knex'
import express from 'express'
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
export const initializeDB = function(req: express.Request, res: express.Response, next: express.NextFunction) {
  req.store = store
  next()
}

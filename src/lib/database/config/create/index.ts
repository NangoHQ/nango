/**
 * Create the Pizzly database if does not exists yet.
 */

import * as config from '../knexfile'
import { Client } from 'pg'
;(async () => {
  if (process.env.NODE_ENV && process.env.NODE_ENV !== 'development') {
    return // skip database creation if not on development
  }

  if (process.env.HEROKU_POSTGRESQL_ONYX_URL || process.env.DATABASE_URL) {
    return // skip database creation on heroku or special database configuration
  }

  const { connection, client } = config['development']

  if (client && client === 'pg' && connection && connection.database) {
    const database = connection.database
    connection.database = 'postgres' // pg default database

    const client = new Client(connection)
    await client.connect()

    client
      .query(`CREATE DATABASE ${database}`)
      .catch(err => {
        if (err.message !== `database "${database}" already exists`) {
          console.error(err)
        }
      })
      .then(() => client.end())
  }
})()

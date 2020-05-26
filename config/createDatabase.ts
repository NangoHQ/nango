/**
 * Create the Pizzly database if does not exists yet.
 */

import * as config from './knexfile'
import { Client } from 'pg'

const { connection, client } = config[process.env.NODE_ENV || 'development']
;(async () => {
  if (connection && connection.database && client === 'pg') {
    const database = connection.database
    connection.database = 'postgres'

    const client = new Client(connection)
    await client.connect()

    client
      .query(`CREATE DATABASE ${database}`)
      .catch(console.error)
      .then(() => client.end())
  }
})()

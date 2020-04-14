// Update with your config settings.
import { connection } from './constants'

module.exports = {
  development: {
    connection,
    client: 'pg',
    pool: {
      min: 2,
      max: 5
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },
  production: {
    connection,
    client: 'pg',
    pool: {
      min: 0,
      max: 1
    },
    migrations: {
      tableName: 'knex_migrations',
      directory: './migrations',
      ext: 'ts'
    }
  }
}

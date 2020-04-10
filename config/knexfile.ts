// Update with your config settings.
import { connection } from './constants'

module.exports = {
  development: {
    connection,
    client: 'pg',
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  },
  production: {
    connection,
    client: 'pg',
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }
}

// Update with your config settings.
import { connection } from './constants'

module.exports = {
  production: {
    connection,
    client: 'postgresql',
    pool: {
      min: 2,
      max: 10
    },
    migrations: {
      tableName: 'knex_migrations'
    }
  }
}

import { Pool } from 'pg'
import { connectionString } from './constants'

export const pool = new Pool({
  connectionString,
  ssl: true
})

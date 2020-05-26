export const COOKIE_SECRET = process.env.COOKIE_SECRET || 'unsecure'
export const HOSTNAME = process.env.HOSTNAME

// Database configuration
export const DATABASE_URL = process.env.DATABASE_URL
export const DB_DATABASE = process.env.DB_DATABASE || 'pizzly'
export const DB_USER = process.env.DB_USER
export const DB_PASSWORD = process.env.DB_PASSWORD
export const DB_HOST = process.env.DB_HOST
export const DB_PORT = process.env.DB_PORT

// Heroku database configuration
export const HEROKU_POSTGRESQL_ONYX_URL = process.env.HEROKU_POSTGRESQL_ONYX_URL

// Database connection
export const connection = DATABASE_URL ||
  HEROKU_POSTGRESQL_ONYX_URL || {
    user: DB_USER!,
    password: DB_PASSWORD!,
    host: DB_HOST!,
    port: DB_PORT!,
    database: DB_DATABASE
  }

// const AUTH_VHOST = `https://${AUTH_SUBDOMAIN}.${HOSTNAME}`
// const PROXY_VHOST = `https://${PROXY_SUBDOMAIN}.${HOSTNAME}`

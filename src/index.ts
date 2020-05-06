import express from 'express'
import bodyParser from 'body-parser'
import passport from 'passport'
import cookieParser from 'cookie-parser'
import * as routes from './routes'
import resourceNotFound from './resourceNotFound'
import errorHandler from './errorHandler'

const { COOKIE_SECRET } = process.env
export const BUID = 'bearerUid' // TODO - What is this for?
export const PORT = process.env.port || 8080
export const AUTH_CALLBACK_URL = process.env.AUTH_CALLBACK_URL || ''

const app = express()

app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json({ limit: '5mb' }))
app.use(passport.initialize())
app.use(cookieParser(COOKIE_SECRET))

app.set('view engine', 'ejs')
app.set('views', './views')
app.set('trust proxy', 1)
app.use('/assets', express.static('./views/assets'))

/**
 * Project homepage
 */

app.get('/', routes.home)

/**
 * API endpoints
 */

app.use('/api', routes.api)

/**
 * Authentication endpoints
 */

app.use('/auth', routes.auth)

/**
 * Dashboard
 */

app.use('/dashboard', routes.dashboard)

/**
 * Proxy feature
 */

app.use('/proxy', routes.proxy)

/**
 * Legacy endpoints
 *
 * Pizzly is a fork of a previous codebase made by Bearer.sh engineering team.
 * To help the migration of Bearer's users, we keep here some legacy endpoints.
 * It's very likely that these endpoints will be removed by the end of 2020,
 * so please do not rely on these endpoints anymore.
 */

app.use('/v2/auth', routes.legacy.auth)
app.use('/apis', routes.legacy.apis)
app.use('/api/v4/functions', routes.legacy.proxy)

/**
 * Error handling - TODO
 */

app.use(errorHandler)
app.use(resourceNotFound)

/**
 * Starting up the server
 */

app.listen(PORT, () => {
  console.log('Pizzly listening on port', PORT)
  if (PORT === 8080) {
    console.log('http://localhost:8080')
  }
})

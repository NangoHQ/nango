import express from 'express'
import App from './app'
import * as routes from './routes'
import resourceNotFound from './resourceNotFound'
import errorHandler from './errorHandler'

const app = App(express())
export const BUID = 'bearerUid' // TODO - What is this for?

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'html')
app.set('views', './dist/views')
app.set('trust proxy', 1)

/**y
 * Authentication endpoints
 */

app.use('/auth', routes.auth)

/**
 * Proxy feature
 */

app.use('/proxy', routes.proxy)

/**
 * API
 */

app.use('/api', routes.api)

/**
 * Dashboard
 */

app.use('/dashboard', routes.dashboard)

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

app.listen(process.env.PORT || 3000, () => {
  console.log('Pizzly listening on port', process.env.PORT || 3000)
})

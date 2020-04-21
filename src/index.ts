import express from 'express'
import App from './app'
import functions from './functions/router'
import errorHandler from './errorHandler'
import * as routes from './routes'

import authV3, { authRouter } from './auth/v3/router'

export const BUID = 'bearerUid'

import { cors } from './proxy/cors'
import resourceNotFound from './resourceNotFound'
import { dbClient } from './lib/database'

const store = dbClient()
function initializeDB(req, _res, next) {
  req.store = store
  next()
}

const app = App(express())

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'html')
app.set('trust proxy', 1)

/**y
 * Authentication endpoints
 */

app.use('/auth', routes.auth)

/**
 * Proxy
 */

app.use('/proxy', routes.proxy)

/**
 * API
 */

app.use('/api', routes.api)

/**
 * Dashboard
 */

// app.use('/dashboard', dashboard)

/**
 * Legacy endpoints
 *
 * Pizzly is a fork of a previous codebase made by Bearer.sh engineering team
 * and previous users were using different endpoints. These endpoints are
 * identified below for backward compatibility. It's very likely that these endpoints
 * will be removed by the end of 2020.
 */

app.set('views', './dist/views')
app.use('/v2/auth', cors, initializeDB, authV3())
app.use('/apis', cors, initializeDB, authRouter())
app.use('/api/v4/functions', cors, initializeDB, functions())
app.use(errorHandler)

// catch 404s
app.use(resourceNotFound)

app.listen(process.env.PORT || 3000, () => {
  console.log('Pizzly App listening on port', process.env.PORT || 3000)
})

import express from 'express'
import App from './app'
import functions from './functions/router'
import errorHandler from './errorHandler'

import authV3, { authRouter } from './auth/v3/router'

export const BUID = 'bearerUid'

import { cors } from './proxy/cors'
import resourceNotFound from './resourceNotFound'
import { dbClient } from './db'

const store = dbClient()

// simulates variables sent by API gateway
const baseApp = express()
const app = App(baseApp)
app.set('trust proxy', 1)

/******* API ******/

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'html')
app.set('views', './dist/views')

app.use('/v2/auth', cors, initializeDB, authV3())
app.use('/apis', cors, initializeDB, authRouter())

app.use('/api/v4/functions', cors, initializeDB, functions())
app.use('/api/v5/functions', cors, initializeDB, functions())

app.use(errorHandler)

function initializeDB(req, _res, next) {
  req.store = store
  next()
}

// catch 404s
app.use(resourceNotFound)

app.listen(process.env.PORT || 3000, () => {
  console.log('Pizzly App listening on port', process.env.PORT || 3000)
})

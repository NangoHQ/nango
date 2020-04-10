import express from 'express'
import App from './app'
import functions from './functions/router'
import errorHandler from './errorHandler'

import authV3, { authRouter } from './auth/v3/router'

export const BUID = 'bearerUid'

import { cors } from './proxy/cors'
import resourceNotFound from './resourceNotFound'

// simulates variables sent by API gateway
const baseApp = express()
const app = App(baseApp)

/******* API ******/

app.engine('html', require('ejs').renderFile)
app.set('view engine', 'html')
app.set('views', './dist/views')

// console.log('Auth VHost:', AUTH_SUBDOMAIN)
// app.use(vhost(AUTH_VHOST, authHostRouter()))

// console.log('Proxy VHost:', PROXY_VHOST)
// app.use(vhost(PROXY_VHOST, proxyFunction()))

app.use('/v2/auth', cors, authV3())
app.use('/apis', cors, authRouter())

app.use('/api/v4/functions', cors, functions())
app.use('/api/v5/functions', cors, functions())

app.use(errorHandler)

// catch 404s
app.use(resourceNotFound)

app.listen(process.env.PORT || 3000, () => {
  console.log('Pizzly App listening on port', process.env.PORT || 3000)
})

import bodyParser from 'body-parser'
import passport from 'passport'
import cookieParser from 'cookie-parser'
import express from 'express'

const { COOKIE_SECRET } = process.env

export default (app = express(), { name = 'IntegrationService' } = {}) => {
  app.use(bodyParser.urlencoded({ extended: false }))
  app.use(bodyParser.json({ limit: '5mb' }))
  app.use(passport.initialize())
  app.use(cookieParser(COOKIE_SECRET))
  return app
}

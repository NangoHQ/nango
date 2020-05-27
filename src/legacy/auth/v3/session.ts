import expressSession from 'express-session'
import { Request, Response, NextFunction } from 'express'
import _KnexSessionStore from 'connect-session-knex'
import Knex from 'knex'
import * as config from '../../../lib/database/config/knexfile'
const knexSessionStore = _KnexSessionStore(expressSession)

export const session = () => {
  const { connection, client } = config[process.env.NODE_ENV || 'development']
  const knex = Knex({ connection, client })

  return expressSession({
    secret: process.env.COOKIE_SECRET || 'cookie-secret',
    cookie: { secure: 'auto' },
    resave: false,
    saveUninitialized: true,
    store: new knexSessionStore({ knex })
  })
}

export const destroySession = (req: Request, _res: Response, next: NextFunction) => {
  req.session!.destroy(next)
}

export const destroySessionOnError = (err: any, req: Request, _res: Response, next: NextFunction) => {
  if (req.session) {
    req.session.destroy(destroyErr => {
      console.error(destroyErr)
    })
  }

  next(err)
}

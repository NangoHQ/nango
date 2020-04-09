import expressSession from 'express-session'
import { COOKIE_SECRET } from '../../constants'
import { Request, Response, NextFunction } from 'express'

export const session = () => {
  return expressSession({ secret: COOKIE_SECRET })
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

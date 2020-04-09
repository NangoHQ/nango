import { Response, NextFunction } from 'express'
import { TAuthIdRequest } from './types'
// import uuidv1 from 'uuid/v1'

export const connectAuthId = (req: TAuthIdRequest, res: Response, next: NextFunction) => {
  // const currentAuthId = req.query.authId
  // const authId = currentAuthId || uuidv1()

  // req.authId = authId
  // req.session.authId = authId

  next()
}

export const callbackAuthId = (req: TAuthIdRequest, _res: Response, next: NextFunction) => {
  const { authId } = req.session
  req.authId = authId

  next()
}

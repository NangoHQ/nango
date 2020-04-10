import { Response, NextFunction } from 'express'
import { TAuthIdRequest } from './types'
import { v1 as uuidv1 } from 'uuid'

export const connectAuthId = (req: TAuthIdRequest, res: Response, next: NextFunction) => {
  const currentAuthId = req.query.authId as string
  const authId = currentAuthId || uuidv1()

  req.authId = authId
  req.session.authId = authId

  next()
}

export const callbackAuthId = (req: TAuthIdRequest, _res: Response, next: NextFunction) => {
  const { authId } = req.session
  req.authId = authId

  next()
}

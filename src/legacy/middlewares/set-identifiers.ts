import { NextFunction, Response, Request } from 'express'
import { IAuthContext } from '../auth/v3/types'

export const connectBuid = (req: Request & IAuthContext, _res: Response, next: NextFunction) => {
  const { buid } = req.params

  req.buid = buid

  next()
}

import { NextFunction, Response, Request } from 'express'
import { IAuthContext } from '../auth/v3/types'

export const connectBuid = (req: Request & IAuthContext, _res: Response, next: NextFunction) => {
  const { buid } = req.params

  console.log('[connectBuid] buid', buid)
  console.log('[connectBuid] params', JSON.stringify(req.params, null, 2))

  req.buid = buid

  next()
}

import { TConnectContextRequest } from './types'
import { NextFunction, Response } from 'express'

export const connectSetupId = (req: TConnectContextRequest, _res: Response, next: NextFunction) => {
  const setupId = req.setupId

  // if (!setupId) {
  //   throw new MissingParameter('setupId')
  // }

  req.session.context.setupId = setupId

  next()
}

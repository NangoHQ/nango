import { ErrorRequestHandler, NextFunction, Response } from 'express'
import { TBackendRequestV4 } from '../types'

export const asyncMiddleware = (fn: (req: any, res: any, next: any) => Promise<void | Response>) =>
  function asyncUtilWrap(req: any, res: any, next: any) {
    const fnReturn = fn(req, res, next)
    return Promise.resolve(fnReturn).catch(next)
  }

export const asyncErrorMiddleware = (fn: (err: any, req: any, res: any, next: any) => Promise<void | Response>) =>
  function asyncUtilWrap(err: any, req: any, res: any, next: any) {
    const fnReturn = fn(err, req, res, next)
    return Promise.resolve(fnReturn).catch(next)
  }

const errorHandler: ErrorRequestHandler = asyncErrorMiddleware(
  async (err: any, req: TBackendRequestV4, res: Response, next: NextFunction) => {
    if (err.statusCode) {
      if (!res.headersSent) {
        return res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message
          }
        })
      }
    }
    next(err)
  }
)

export default errorHandler

import { TErrorHandlerRequest } from './types'
import { Response, NextFunction } from 'express'
import { AuthenticationFailed, NoAuthInProgress } from './errors'
import { isEmpty } from '../../functions/utils'

const respondWithOAuthError = (
  res: Response,
  { statusCode, code, message }: { statusCode: number; code: string; message: string }
) => {
  res.header('Content-Type', 'text/html')
  res.status(statusCode)
  res.render('auth/error', { error: `${code}: ${message}` })
}

const respondWithCallbackError = (req: TErrorHandlerRequest, res: Response, err: AuthenticationFailed) => {
  res.header('Content-Type', 'text/html')
  res.status(err.statusCode)
  res.render('auth/callback', {
    authId: req.authId,
    error: err.error,
    error_description: err.errorDescription,
    integrationUuid: req.buid
  })
}

const respondWithCallbackPlaceholder = (
  req: TErrorHandlerRequest,
  res: Response,
  { statusCode, code, message }: { statusCode: number; code: string; message: string }
) => {
  res.header('Content-Type', 'text/html')
  res.status(statusCode)
  res.render('auth/placeholder', {
    error: `${code}: ${message}`,
    callbackUrl: req.originalUrl,
    method: req.method
  })
}

export const errorHandler = (err: any, req: TErrorHandlerRequest, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err)
  }

  if (err.statusCode) {
    if (err instanceof AuthenticationFailed) {
      return respondWithCallbackError(req, res, err)
    }

    if (err instanceof NoAuthInProgress && isEmpty(req.query)) {
      return respondWithCallbackPlaceholder(req, res, err)
    }

    return respondWithOAuthError(res, err)
  }
  respondWithOAuthError(res, {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: 'Encountered an unexpected error. Please contact support'
  })
}

import { NextFunction, Response } from 'express'

import { TAuthenticateRequest } from '../../types'
import { getCodeRedirectURL, getTokenWithCode } from '../../../clients/oauth2'
import { asyncMiddleware } from '../../../../errorHandler'
import { responseToCredentials } from './common'
import { AuthenticationFailed } from '../../errors'

export const authenticate = asyncMiddleware(async (req: TAuthenticateRequest, res: Response, next: NextFunction) => {
  const callbackURL = process.env.AUTH_CALLBACK_URL || `${req.protocol}://${req.get('host')}/auth/callback`
  const {
    credentials: { clientId, clientSecret },
    scopes = []
  } = req.setupDetails
  const { code, error } = req.query
  const {
    authorizationURL,
    authorizationMethod,
    authorizationParams,
    bodyFormat,
    config,
    tokenParams,
    tokenURL
  } = req.integrationConfig

  if (error) {
    throw AuthenticationFailed.fromOAuthRequest(req, undefined)
  }

  if (code) {
    const tokenResult = await getTokenWithCode({
      authorizationMethod,
      bodyFormat,
      clientId,
      clientSecret,
      code,
      tokenParams,
      tokenURL,
      callbackURL
    })

    // console.log('tokenResult', tokenResult)
    req.credentials = responseToCredentials(tokenResult)
    // console.log('credentials', req.credentials)
    // console.log('decodedToken', tokenResult.decodedResponse)
    req.tokenResponse = tokenResult.decodedResponse

    return next()
  }

  // const { scope = [], state = 'none' } = config || {}
  const { state = 'none' } = config || {}

  const redirectURL = getCodeRedirectURL({
    authorizationParams,
    authorizationURL,
    clientId,
    state,
    scope: scopes || config?.scope || [],
    callbackURL
  })

  res.redirect(redirectURL)
})

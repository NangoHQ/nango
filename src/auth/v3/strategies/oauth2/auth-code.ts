import { NextFunction, Response } from 'express'

import { TAuthenticateRequest } from '../../types'
import { AUTH_CALLBACK_URL } from '../../../../../config/constants'
import { getCodeRedirectURL, getTokenWithCode } from '../../../../clients/oauth2'
import { asyncMiddleware } from '../../../../errorHandler'
import { responseToCredentials } from './common'
import { AuthenticationFailed } from '../../errors'

export const authenticate = asyncMiddleware(async (req: TAuthenticateRequest, res: Response, next: NextFunction) => {
  const { clientID, clientSecret, scopes = [] } = req.setupDetails
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
      clientID,
      clientSecret,
      code,
      tokenParams,
      tokenURL,
      callbackURL: AUTH_CALLBACK_URL
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
    clientID,
    state,
    scope: scopes || config!.scope || [],
    callbackURL: AUTH_CALLBACK_URL
  })

  res.redirect(redirectURL)
})

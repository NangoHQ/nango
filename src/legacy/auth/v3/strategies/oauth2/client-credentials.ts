import { NextFunction, Response } from 'express'

import { TAuthenticateRequest } from '../../types'
import { getTokenWithClientCredentials } from '../../../clients/oauth2'
import { asyncMiddleware } from '../../../../errorHandler'
import { responseToCredentials } from './common'

export const authenticate = asyncMiddleware(async (req: TAuthenticateRequest, _res: Response, next: NextFunction) => {
  const { authorizationMethod, bodyFormat, config, tokenURL } = req.integrationConfig
  const { scope = [] } = config || {}
  const { clientId, clientSecret } = req.setupDetails.credentials

  const tokenResult = await getTokenWithClientCredentials({
    authorizationMethod,
    bodyFormat,
    clientId,
    clientSecret,
    scope,
    tokenURL
  })

  req.credentials = responseToCredentials(tokenResult)
  req.tokenResponse = tokenResult.decodedResponse

  next()
})

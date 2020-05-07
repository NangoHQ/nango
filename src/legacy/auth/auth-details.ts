import { Response, NextFunction } from 'express'

import { AuthDetailsRequest } from './configure-request'
import { AuthDetails, EAuthType, OAuth1AuthDetails, OAuth2AuthDetails } from './v3/types'
import { OAuthOnlyEndpoint } from './v3/errors'
import { isOAuthType } from './v3/strategy'
import { asyncMiddleware } from '../errorHandler'
import { NO_VALUE } from './v3/strategies/oauth2/common'

enum TokenType {
  OAuth1 = 'oauth',
  OAuth2AccessToken = 'bearer',
  OAuth2RefreshToken = 'refresh', // Not defined in RFC7662
  OpenIDConnectToken = 'id' // Not defined in RFC7662
}

// Follows RFC7662 unless stated otherwise
const formatToken = ({
  clientId,
  expiresIn,
  scopes,
  tokenType,
  updatedAt,
  value
}: {
  clientId: string
  expiresIn?: number
  scopes?: string[]
  tokenType: TokenType
  updatedAt: number
  value?: string
}) => {
  if (!value || value === NO_VALUE) {
    return
  }

  const issuedAt = Math.trunc(updatedAt / 1000)
  const expiresAt = expiresIn ? issuedAt + expiresIn : undefined
  const active = !expiresAt || expiresAt * 1000 > Date.now()

  return {
    active,
    value, // Not defined in RFC7662
    client_id: clientId,
    exp: expiresAt,
    iat: issuedAt,
    scope: scopes ? scopes.join(' ') : undefined,
    token_type: tokenType
  }
}

const formatAuthDetails = (authType: EAuthType, authDetails: OAuth1AuthDetails | OAuth2AuthDetails) => {
  if (authType === EAuthType.OAuth1) {
    const {
      accessToken,
      callbackParams,
      consumerKey,
      consumerSecret,
      expiresIn,
      signatureMethod,
      tokenResponse,
      tokenSecret,
      updatedAt
    } = authDetails as OAuth1AuthDetails

    return {
      callbackParams,
      consumerKey,
      consumerSecret,
      signatureMethod,
      tokenResponse,
      tokenSecret,
      accessToken: formatToken({
        expiresIn,
        updatedAt,
        clientId: consumerKey,
        tokenType: TokenType.OAuth1,
        value: accessToken
      })
    }
  }

  const {
    accessToken,
    callbackParams,
    clientId,
    clientSecret,
    expiresIn,
    idToken,
    idTokenJwt,
    refreshToken,
    tokenResponse,
    updatedAt
  } = authDetails as OAuth2AuthDetails

  // OAuth2
  return {
    callbackParams,
    clientId,
    clientSecret,
    idTokenJwt,
    tokenResponse,
    accessToken: formatToken({
      clientId,
      updatedAt,
      expiresIn,
      tokenType: TokenType.OAuth2AccessToken,
      value: accessToken
    }),
    idToken: formatToken({ clientId, updatedAt, tokenType: TokenType.OpenIDConnectToken, value: idToken }),
    refreshToken: formatToken({ clientId, updatedAt, tokenType: TokenType.OAuth2RefreshToken, value: refreshToken })
  }
}

export const authDetailsResponse = asyncMiddleware(
  async (req: FetchAuthDetailsRequest, res: Response, _next: NextFunction) => {
    const { authType } = await req.integration.config()

    if (!isOAuthType(authType)) {
      throw new OAuthOnlyEndpoint(authType)
    }

    res.json(formatAuthDetails(authType, req.auth as OAuth1AuthDetails | OAuth2AuthDetails))
  }
)

export interface FetchAuthDetailsRequest extends AuthDetailsRequest {
  auth: AuthDetails
}

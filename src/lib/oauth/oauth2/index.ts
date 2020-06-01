import { getTokenWithClientCredentials, getTokenWithRefreshToken } from '../../../legacy/auth/clients/oauth2'
import { GrantType } from '../../../legacy/auth/v3/strategies/oauth2'
import { AccessTokenExpired } from '../../../legacy/auth/v3/errors'
import { Types } from '../../../types'

/**
 * Refresh an authentication using OAuth2 strategy
 *
 * @param integration - The integration metadata
 * @param configuration - The configuration
 * @param oldAuthentication - The previous authentication
 */

export const refresh = async (
  integration: Types.Integration<Types.OAuth2Config>,
  configuration: Types.Configuration,
  oldAuthentication: Types.Authentication
): Promise<Types.OAuth2Payload> => {
  const oldPayload: Types.OAuth2Payload = oldAuthentication.payload
  const refreshToken = oldPayload.refreshToken
  const { clientId, clientSecret } = configuration.credentials as Types.OAuth2Credentials

  if (!refreshToken) {
    const { tokenParams, tokenURL, authorizationMethod, bodyFormat } = integration.auth
    const { grant_type: grantType } = tokenParams
    if (grantType !== GrantType.ClientCredentials) {
      throw new AccessTokenExpired()
    }

    const tokenResult = await getTokenWithClientCredentials({
      authorizationMethod,
      bodyFormat,
      clientId,
      clientSecret,
      tokenURL,
      scope: configuration.scopes
    })

    const oauthPayload: Types.OAuth2Payload = {
      serviceName: oldPayload.serviceName,
      userId: oldAuthentication.auth_id,
      setupId: oldAuthentication.setup_id,
      updatedAt: Date.now(),
      ...tokenResult
    }

    return oauthPayload
  }

  const { idToken, refreshURL, tokenURL } = integration.auth

  const tokenResult = await getTokenWithRefreshToken({
    ...{ clientId, clientSecret },
    // ...setupDetails,
    refreshToken,
    idToken,
    tokenURL: refreshURL || tokenURL
  })

  const oauthPayload: Types.OAuth2Payload = {
    serviceName: oldPayload.serviceName,
    userId: oldAuthentication.auth_id,
    setupId: oldAuthentication.setup_id,
    updatedAt: Date.now(),
    ...tokenResult
  }

  return oauthPayload
}

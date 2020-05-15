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
  integration: Types.Integration,
  configuration: Types.Configuration,
  oldAuthentication: Types.Authentication
): Promise<Types.OAuth2Payload> => {
  const oldPayload: Types.OAuth2Payload = oldAuthentication.payload
  const refreshToken = oldPayload.refreshToken
  const { clientId, clientSecret } = configuration.credentials as Types.OAuth2Credentials

  if (!refreshToken) {
    const { grantType } = integration.config

    if (grantType !== GrantType.ClientCredentials) {
      throw new AccessTokenExpired()
    }

    const scope = configuration.scopes
    const { authorizationMethod, bodyFormat, tokenURL } = integration.config

    const tokenResult = await getTokenWithClientCredentials({
      authorizationMethod,
      bodyFormat,
      clientId,
      clientSecret,
      scope,
      tokenURL
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

  const { idToken, refreshURL, tokenURL } = integration.config

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

import * as OAuth2 from './oauth2'
import { Types } from '../../types'
import { configurations, authentications } from '../database'
import { isOAuth2 } from '../database/integrations'
import { PizzlyError } from '../error-handling'
import { NO_VALUE } from '../../legacy/auth/v3/strategies/oauth2/common'

/**
 * Determine if an access token has expired by comparing
 * the expiresIn value with the current time.
 *
 * @param authentication (Types.Authentication) - The authentication object
 * @return (boolean)
 */

export const accessTokenHasExpired = async (authentication: Types.Authentication) => {
  const { expiresIn } = authentication.payload

  if (!expiresIn) {
    return false
  }

  const updatedAt = Date.parse(authentication.updated_at)
  const expiredFromThisTime = expiresIn * 1000 + updatedAt
  const safeRefreshTime = expiredFromThisTime - 15 * 60 * 1000 // 15 minutes
  const isNowLaterThanSafeRefreshTime = Date.now() > safeRefreshTime

  return isNowLaterThanSafeRefreshTime
}

/**
 * Refresh an authentication based on the OAuth strategies
 * and the integration's configuration.
 *
 * @param integration - The integration config file
 * @param oldAuthentication - The old authentication
 * @returns authentication - The new authentication (saved in database)
 */

export const refreshAuthentication = async (
  integration: Types.Integration,
  oldAuthentication: Types.Authentication
) => {
  const configuration = await configurations.get(integration.id, oldAuthentication.setup_id)
  if (isOAuth2(integration)) {
    const oldPayload: Types.OAuth2Payload = oldAuthentication.payload
    const refreshToken = oldPayload.refreshToken

    if (!refreshToken || refreshToken === NO_VALUE) {
      throw new PizzlyError('token_refresh_missing')
    }

    const newPayload = await OAuth2.refresh(integration, configuration, oldAuthentication)

    const newAuthentication: Types.Authentication = {
      object: 'authentication',
      id: oldAuthentication.auth_id,
      auth_id: oldAuthentication.auth_id,
      setup_id: oldAuthentication.setup_id,
      payload: newPayload,
      created_at: oldAuthentication.created_at,
      updated_at: new Date().toISOString()
    }

    await authentications.update(oldAuthentication.auth_id, newAuthentication)
    return newAuthentication
  }
  // TODO handle oauth1 token freshness
}

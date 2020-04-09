import { NextFunction, Response } from 'express'
import merge from 'merge'

import { TAuthenticateRequest, IFetchAuthDetailsParams, TIntegrationConfig } from '../../types'
import { AccessTokenExpired, InvalidGrantType, InvalidAuthId } from '../../errors'
import {
  // getAuth,
  TOAuth2UserAttributes
  // getSetupDetails,
  // updateAuthV3
} from '../../../../clients/integrations'
// import { checkSetupIdConsistency } from '../setup-id-consistency'
import { getTokenWithRefreshToken, getTokenWithClientCredentials } from '../../../../clients/oauth2'
import { authenticate as authCodeAuthenticate } from './auth-code'
import { authenticate as clientCredentialsAuthenticate } from './client-credentials'
import { NO_VALUE, responseToCredentials, getIdTokenJwt } from './common'
import { expandAuthConfig } from '../../../../api-config/auth-config'

export enum GrantType {
  AuthCode = 'authorization_code',
  ClientCredentials = 'client_credentials'
}

export const CLOCK_DRIFT_MS = 60 * 1000

export const nullAuthDetails = {
  idToken: null,
  idTokenJwt: null,
  accessToken: null
}

const strategies = {
  [GrantType.AuthCode]: authCodeAuthenticate,
  [GrantType.ClientCredentials]: clientCredentialsAuthenticate
}

export const authenticate = (req: TAuthenticateRequest, res: Response, next: NextFunction) => {
  const { grantType = GrantType.AuthCode } = req.integrationConfig

  if (!Object.values(GrantType).includes(grantType)) {
    throw new InvalidGrantType(grantType)
  }

  // console.log(grantType)
  // console.log(req.integrationConfig)

  strategies[grantType](req, res, next)
}

const performRefresh = async ({
  existingCredentials,
  integrationConfig
  // setupDetails
}) => {
  const { refreshToken, idToken } = existingCredentials
  // const { clientID, clientSecret } = setupDetails
  const { clientID, clientSecret } = { clientID: 'clientID', clientSecret: 'clientSecret' }

  const { authorizationMethod, bodyFormat, config, grantType, refreshURL, tokenURL } = integrationConfig

  if (refreshToken === NO_VALUE) {
    if (grantType === GrantType.ClientCredentials) {
      const { scope = [] } = config || {}

      return await getTokenWithClientCredentials({
        authorizationMethod,
        bodyFormat,
        clientID,
        clientSecret,
        scope,
        tokenURL
      })
    }

    throw new AccessTokenExpired()
  }

  return await getTokenWithRefreshToken({
    ...{ clientID: 'ClientID', clientSecret: 'clientSecret' },
    // ...setupDetails,
    refreshToken,
    idToken,
    tokenURL: refreshURL || tokenURL
  })
}

const refreshAndUpdateCredentials = async (
  params: IFetchAuthDetailsParams,
  existingCredentials: TOAuth2UserAttributes,
  integrationConfig: TIntegrationConfig
) => {
  const { integration, authId } = params
  const { callbackParamsJSON, connectParams = {}, setupId, tokenResponseJSON } = existingCredentials

  // const setupDetails = await getSetupDetails({
  //   scopedUserDataTableName,
  //   setupId,
  //   buid: integration.buid,
  //   clientId: environmentIdentifier
  // })

  const tokenResult = await performRefresh({
    existingCredentials,
    // setupDetails,
    integrationConfig: expandAuthConfig({ connectParams, authConfig: integrationConfig as any })
  })
  const credentials = responseToCredentials(tokenResult)

  const previousResponse = tokenResponseJSON ? JSON.parse(tokenResponseJSON) : {}
  const tokenResponse = merge.recursive(previousResponse, tokenResult.decodedResponse)
  const updatedAt = Date.now()

  const userAttributes: TOAuth2UserAttributes = {
    setupId,
    updatedAt,
    tokenResponseJSON: JSON.stringify(tokenResponse),
    serviceName: integration.buid,
    userId: authId!,
    ...credentials
  }

  if (callbackParamsJSON) {
    userAttributes.callbackParamsJSON = callbackParamsJSON
  }

  // await updateAuthV3({
  //   servicesTableName,
  //   userAttributes,
  //   buid: integration.buid,
  //   authId: authId!,
  //   clientId: environmentIdentifier
  // })

  const callbackParams = callbackParamsJSON ? JSON.parse(callbackParamsJSON) : undefined

  // const { clientID, clientSecret } = setupDetails
  const { clientID, clientSecret } = { clientID: 'clientID', clientSecret: 'ClientSecret' }
  const { accessToken, expiresIn, idToken, idTokenJwt, refreshToken } = credentials

  return {
    accessToken,
    callbackParams,
    clientID,
    clientSecret,
    connectParams,
    expiresIn,
    idToken,
    idTokenJwt,
    refreshToken,
    tokenResponse,
    updatedAt
  }
}

export const fetchAuthDetails = async (params: IFetchAuthDetailsParams, integrationConfig: TIntegrationConfig) => {
  const {
    aliasBuid,
    // scopedUserDataTableName,
    // servicesTableName,
    // environmentIdentifier,
    // integration,
    authId
    // setupId: setupIdParam,
    // setupIdFromRequest
  } = params

  // const credentials = await getAuth<TOAuth2UserAttributes>({
  //   servicesTableName,
  //   buid: integration.buid,
  //   authId: authId!,
  //   clientId: environmentIdentifier
  // })
  const slackCredentials = {
    ok: true,
    access_token: 'xoxp-150714643009-151327962675-1046846324930-de392d013c002296efb52e966aff0a5e',
    scope: 'identify,channels:read,pins:read,users.profile:read,reminders:write',
    user_id: 'U4F9MUAKV',
    team_id: 'T4EM0JX09',
    enterprise_id: null,
    team_name: 'Bearer'
  }

  const credentials = {
    accessToken: slackCredentials.access_token,
    callbackParamsJSON: '{}',
    connectParams: {},
    setupId: 'setupId',
    expiresIn: Date.now() + 1000000000,
    updatedAt: Date.now(),
    idToken: 'abc',
    idTokenJwt: 'abc',
    refreshToken: 'abc',
    tokenResponseJSON: '{}',
    clientID: 'clientId',
    clientSecret: 'clientSecret',
    serviceName: 'service',
    userId: 'userId'
  }

  if (!credentials || !credentials.accessToken) {
    throw new InvalidAuthId(aliasBuid, authId!)
  }

  const {
    callbackParamsJSON,
    connectParams = {},
    // setupId,
    expiresIn,
    updatedAt,
    accessToken,
    idToken,
    idTokenJwt,
    refreshToken,
    tokenResponseJSON
  } = credentials
  const tokenResponse = tokenResponseJSON ? JSON.parse(tokenResponseJSON) : undefined
  const callbackParams = callbackParamsJSON ? JSON.parse(callbackParamsJSON) : undefined

  // checkSetupIdConsistency({ setupId, setupIdParam, setupIdFromRequest })

  if (expiresIn) {
    // Sorry to be that explicit but that's something so hard to understand
    const expiredFromThisTime = expiresIn * 1000 + updatedAt

    const safeRefreshTime = expiredFromThisTime - CLOCK_DRIFT_MS

    const isNowLaterThanSafeRefreshTime = Date.now() > safeRefreshTime

    if (isNowLaterThanSafeRefreshTime) {
      return refreshAndUpdateCredentials(params, credentials, integrationConfig)
    }
  }

  const { clientID, clientSecret } = credentials
  if (!clientID || !clientSecret) {
    // ;({ clientID, clientSecret } = await getSetupDetails({
    //   scopedUserDataTableName,
    //   setupId,
    //   buid: integration.buid,
    //   clientId: environmentIdentifier
    // }))
  }

  return {
    accessToken,
    callbackParams,
    clientID,
    clientSecret,
    connectParams,
    expiresIn,
    idToken,
    refreshToken,
    tokenResponse,
    updatedAt,
    idTokenJwt: idTokenJwt || getIdTokenJwt(idToken)
  }
}

// import { SetupDetailsNotFound } from '../errors'
import { TIntegrationConfig, EAuthType } from '../auth/v3/types'
import '../../integrations'
import { dbClient } from '../db'

interface ICommonUserAttributes {
  serviceName: string
  userId: string
  updatedAt: number
  setupId: string
  scopes?: any
  tokenResponseJSON?: string
  callbackParamsJSON?: string
  connectParams?: any
}

export type TOAuth1UserAttributes = ICommonUserAttributes & {
  accessToken: string
  tokenSecret: string
  consumerKey?: string
  consumerSecret?: string
  expiresIn: number
}

export type TOAuth2UserAttributes = ICommonUserAttributes & {
  accessToken: string
  clientID?: string
  clientSecret?: string
  refreshToken?: string
  expiresIn?: number
  idToken?: string
  idTokenJwt?: any
}

interface IAuthParams {
  buid: string
  authId: string
}

export type TAuthUserAttributes = TOAuth1UserAttributes | TOAuth2UserAttributes

export interface IAuthResult {
  id: string
  buid: string
  auth_id: string
  user_attributes: {
    accessToken: string
    refreshToken: string
    idToken: string
    expiresIn: any
    scopes: string[]
    tokenResponseJSON: string
    updatedAt: any
    idTokenJwt: any
    connectParams?: any
    callbackParamsJSON: any
  }
}

export const updateAuth = async ({
  buid,
  authId,
  userAttributes
}: IAuthParams & { userAttributes: TAuthUserAttributes }) => {
  const client = dbClient()
  await client('authentications').insert({ buid, auth_id: authId, user_attributes: userAttributes })
}

export const getAuth = async <IAuthResult>({ buid, authId }: IAuthParams) => {
  const client = dbClient()

  console.log('[getAuth] buid/authId', buid, authId)

  return (await client('authentications')
    .where({ buid, auth_id: authId })
    .first()) as IAuthResult
}

export const getConfig = async ({ buid }: { buid: string }) => {
  let item = {} as any
  try {
    item = require(`../../integrations/${buid}.json`)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return false
    }
  }

  const configItem = item.config as TIntegrationConfig

  if (configItem.authType) {
    configItem.authType = configItem.authType.toUpperCase() as EAuthType
  }

  return { ...configItem, requestConfig: item.request }
}

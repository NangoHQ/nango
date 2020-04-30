// import { SetupDetailsNotFound } from '../errors'
import { TIntegrationConfig, EAuthType } from '../v3/types'
import '../../../integrations'
import Knex from 'knex'

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
  setupId,
  userAttributes,
  store
}: IAuthParams & { userAttributes: TAuthUserAttributes } & { store: any; setupId: string }) => {
  await store('authentications').insert({ buid, auth_id: authId, setup_id: setupId, user_attributes: userAttributes })
}

export const getAuth = async <IAuthResult>({ buid, authId, store }: IAuthParams & { store: any }) => {
  console.log('[getAuth] buid/authId', buid, authId)

  return (await store('authentications')
    .where({ buid, auth_id: authId })
    .first()) as IAuthResult
}

export const getConfig = async ({ buid }: { buid: string }) => {
  let item = {} as any
  try {
    item = require(`../../../integrations/${buid}.json`)
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

export const saveSetupDetails = async ({
  buid,
  setupId,
  setup,
  scopes,
  store
}: {
  buid: string
  setupId: string
  store: Knex
  setup: any
  scopes: string[] | undefined
}) => {
  await store('configurations').insert({ buid, setup, scopes, setup_id: setupId })
}

export const getSetupDetails = async ({
  buid,
  setupId,
  store
}: {
  buid: string
  setupId: string | undefined
  store: Knex
}) => {
  if (setupId) {
    return await store('configurations')
      .where({ buid, setup_id: setupId })
      .first()
  }

  return await store('configurations')
    .where({ buid })
    .orderBy('updated_at', 'desc')
    .first()
}

// import { SetupDetailsNotFound } from '../errors'
import { TIntegrationConfig, EAuthType } from '../v3/types'
import '../../../../integrations'
import Knex from 'knex'

interface ICommonOAuthPayload {
  serviceName: string
  userId: string
  updatedAt: number
  setupId: string
  scopes?: any
  tokenResponseJSON?: string
  callbackParamsJSON?: string
  connectParams?: any
}

export type TOAuth1Payload = ICommonOAuthPayload & {
  accessToken: string
  tokenSecret: string
  consumerKey?: string
  consumerSecret?: string
  expiresIn: number
}

export type TOAuth2Payload = ICommonOAuthPayload & {
  accessToken: string
  clientId?: string
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

export type TOAuthPayload = TOAuth1Payload | TOAuth2Payload

export interface IAuthResult {
  id: string
  buid: string
  auth_id: string
  payload: {
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
  payload,
  store
}: IAuthParams & { payload: TOAuthPayload } & { store: any; setupId: string }) => {
  await store('authentications').insert({ buid, auth_id: authId, setup_id: setupId, payload })
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
    item = require(`../../../../integrations/${buid}.json`)
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return false
    }
  }

  const configItem = item.auth as TIntegrationConfig
  if (configItem.authType) {
    configItem.authType = configItem.authType.toUpperCase() as EAuthType
  }

  return { ...configItem, authConfig: configItem, requestConfig: item.request }
}

export const saveSetupDetails = async ({
  buid,
  setupId,
  credentials,
  scopes,
  store
}: {
  buid: string
  setupId: string
  store: Knex
  credentials: any
  scopes: string[] | undefined
}) => {
  await store('configurations').insert({ buid, credentials, scopes, setup_id: setupId })
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

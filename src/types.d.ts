import { Request } from 'express'

import { TWithInstrument } from './instrumentation/middleware'
import { Integration } from './legacy/functions/integration'
import { AuthDetails } from './legacy/auth/v3/types'
import Knex from 'knex'
import { BodyFormat } from './legacy/auth/clients/oauth2'

export type Omit<T, K> = Pick<T, Exclude<keyof T, K>>

export interface IntegrationServiceRequest extends Request {
  environmentIdentifier: string
  organizationIdentifier: string
}

export type TRequest = Request & {
  clientId: string
  authId: string
  organizationIdentifier?: any
  environmentIdentifier?: any
  bearerOverhead?: number
} & TWithInstrument

export type TServerResponse = {
  data: {
    data: {
      organization?: {
        identifier?: string
        id: string
        clientId: string
        user?: {
          auth0uuid: string
        }
      }
      errors?: {
        field: string
        messages: string[]
      }
    }
  }
}

export type TBackendRequestV4 = TRequest & {
  userId: string
  authId: string
  auth: any
  bearerResponse: {
    StatusCode: number
    Payload: any
  }
  userDefinedData: any
  functionArn?: string
  organizationIdentifier?: any
  environmentIdentifier?: any
  isBackend: string
  setupId: string
  integration: Integration
  functionName: string
  internalCorrelationId?: string
  userCorrelationId?: string
  fullLogs: boolean
}

type TRequestLog = {
  endedAt?: number
  duration?: number
} & TRequest

export type TIdentifiersRequest = Request & {
  clientId: string
  environmentIdentifier: string
  organizationIdentifier: string
  buid?: string
  uuid?: string
  alias?: string
  webhookConfig?: any
  fullLogs?: boolean
}

/**********************/

declare global {
  namespace Express {
    export interface Request {
      store?: Knex
    }
  }
}

export namespace Types {
  export interface Integration<Config = OAuth2Config | OAuth1Config> {
    id: string
    image: string
    name: string
    // TODO - Type the config (and rename config to auth?)
    auth: Config
    request: {
      baseURL: string
      headers?: { [key: string]: string }
      params?: { [key: string]: string }
    }
  }

  type OAuth2Config = {
    authorizationMethod: AuthorizationMethod
    authorizationParams: Record<string, string> //{ prompt: 'consent'; access_type: 'offline' }
    authorizationURL: string
    revocationURL?: string
    revocationParams?: Record<string, string>
    revocationHeaders?: Record<string, string>
    authType: 'OAUTH2'
    bodyFormat: BodyFormat
    config: {
      response_type: 'code'
      scope: string[]
    }
    idToken?: string // TODO explain how it is possible to have this in the config
    hint: string
    provider: string
    refreshURL?: string
    setupKeyLabel?: string
    setupSecretLabel?: string
    tokenParams: {
      grant_type: 'authorization_code' | 'client_credentials'
    }
    tokenURL: string
  }

  type OAuth1Config = {
    accessTokenURL: string
    authorizationParams: Record<string, string> //{ "expiration": "never" },
    authType: 'OAUTH1'
    callbackURL: string
    config: Record<string, string> //{ "scope": ["read"] },
    hint: string
    provider: string
    requestTokenURL: string
    setupKeyLabel?: string
    setupSecretLabel?: string
    signatureMethod: 'HMAC-SHA1' | 'PLAINTEXT' | 'RSA-SHA1'
    tokenParams: {}
    userAuthorizationURL: string
  }

  export interface OAuth2Credentials {
    clientId: string
    clientSecret: string
  }

  export interface OAuth1Credentials {
    consumerKey: string
    consumerSecret: string
  }

  export interface Configuration {
    object: string
    id: string
    setup_id: string
    scopes: string[]
    credentials: OAuth1Credentials | OAuth2Credentials
    createdAt?: string
    modifiedAt?: string
  }

  export interface Authentication {
    object: string
    id: string
    auth_id: string
    setup_id: string
    payload: OAuthPayload
    created_at: string
    updated_at: string
  }

  /**
   * OAuth payload types
   */

  enum AuthType {
    NoAuth = 'NO_AUTH',
    OAuth1 = 'OAUTH1',
    OAuth2 = 'OAUTH2'
  }

  interface CommonOAuthPayload {
    serviceName: string
    userId: string
    updatedAt: number
    setupId: string
    scopes?: any
    tokenResponseJSON?: string
    callbackParamsJSON?: string
    connectParams?: any
  }

  export interface OAuth1Payload extends CommonOAuthPayload {
    accessToken: string
    tokenSecret: string
    consumerKey?: string
    consumerSecret?: string
    expiresIn: number
  }

  export interface OAuth2Payload extends CommonOAuthPayload {
    accessToken: string
    refreshToken?: string
    clientId?: string
    clientSecret?: string
    expiresIn?: number
    idToken?: string
    idTokenJwt?: any
  }

  type OAuthPayload = OAuth1Payload | OAuth2Payload
}

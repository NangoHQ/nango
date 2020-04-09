import { Request } from 'express'

import { TWithInstrument } from './instrumentation/middleware'
import { Integration } from './functions/integration'
import { AuthDetails } from './auth/v3/types'

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
  isBackend: boolean
  aliasBuid: string
  buid: string
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

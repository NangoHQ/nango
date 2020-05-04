import { AxiosRequestConfig } from 'axios'

declare namespace Types {
  export interface ConnectOptions {
    authId?: string
    setupId?: string
  }

  export interface ConnectSuccess {
    authId: string
  }

  export interface ConnectError extends Error {}

  export interface IntegrationOptions {
    authId?: string
    setupId?: string
  }

  export type RequestHeaders = Record<string, string | number | undefined>
  export type RequestMethod = AxiosRequestConfig['method']

  export interface RequestParameters {
    headers?: RequestHeaders
    query?: Record<string, string | number>
    body?: any
  }
}

export default Types

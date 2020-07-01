declare namespace Types {
  export interface IntegrationOptions {
    authId?: string
    setupId?: string
  }

  export type RequestHeaders = Record<string, string | number | undefined>
  export type RequestMethod = 'GET' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'POST' | 'PUT' | 'PATCH'

  export type RequestQueryString = Record<string, string | number>
  export interface RequestParameters {
    headers?: RequestHeaders
    query?: RequestQueryString
    body?: any
  }
}

export default Types

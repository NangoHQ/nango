import { buildAxiosRequest } from './helpers'

import axios from 'axios'

const DEFAULT_CLIENT_TIMEOUT = 30 * 1000

interface IPayload {
  body: any
  queryStringParameters: any
  template: {
    authType: any
    connectParams: any
    headers: any
    method: any
    path: any
    requestConfig: any
    auth: any
  }
  userDefinedData: {
    authType: any
    headers: any
    method: any
    path: any
    data: any
  }
  context: {
    auth: any
    isBackend: boolean
    metadata: {
      filterKeys: string[]
    }
  }
}

export const proxyHandler = async (payload: IPayload) => {
  const { method, path, headers, data } = payload.userDefinedData
  const { template } = payload

  // console.log('here', template)
  // console.log(payload)
  try {
    if (!template) {
      throw new Error('Missing proxy client configuration')
    }

    const templateRequestConfig = template
    const axiosRequest = buildAxiosRequest({
      templateRequestConfig,
      method,
      headers,
      path,
      data
    })

    let response
    try {
      response = await axios({
        timeout: DEFAULT_CLIENT_TIMEOUT,
        ...axiosRequest
      })
    } catch (e) {
      // we are a proxy and must not fail it distant API is failing
      if (e.response) {
        response = e.response
      } else {
        throw e
      }
    }
    // console.log('FUNCTION', response.data)
    return {
      Payload: {
        data: response.data,
        headers: response.headers
      },
      StatusCode: response.status
    }
  } catch (e) {
    if (e.code === 'ECONNABORTED') {
      return {
        StatusCode: 504,
        Payload: {
          headers: {},
          data: {
            error: {
              CODE: 'PROXY_ERROR',
              message: 'Timed out when connecting to remote host'
            }
          }
        }
      }
    }
    return {
      StatusCode: 500,
      Payload: {
        headers: {},
        data: {
          error: {
            CODE: 'PROXY_ERROR',
            message: 'An error occurred during proxy initialization'
          }
        }
      }
    }
  }
}

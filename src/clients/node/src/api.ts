/**
 * Pizzly(JS) > Integration
 */

import fetch from 'node-fetch'
import Types from './types'
import { cleanHeaders, toURL } from './utils'

export default class PizzlyAPI {
  private key: string
  private integration: string
  private origin: string

  constructor(integration: string, key: string, origin: string) {
    this.integration = integration
    this.origin = origin
    this.key = key
  }

  /**
   * `get` perform get request
   */

  public get = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('GET', endpoint, parameters)
  }

  /**
   * `head` perform head request
   */

  public head = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('HEAD', endpoint, parameters)
  }

  /**
   * `post` perform post request
   */

  public post = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('POST', endpoint, parameters)
  }

  /**
   * `put` perform put request
   */

  public put = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('PUT', endpoint, parameters)
  }

  /**
   * `delete` perform delete request
   */

  public delete = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('DELETE', endpoint, parameters)
  }

  /**
   * `patch` perform patch request
   */

  public patch = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('PATCH', endpoint, parameters)
  }

  /**
   * Make the HTTP request
   * (using node-fetch behind the scene)
   */

  public request = (method: Types.RequestMethod, endpoint: string, parameters: Types.RequestParameters = {}) => {
    if (parameters && typeof parameters !== 'object') {
      throw new Error(
        'Unable to trigger API request. Request parameters should be an object in the form "{ headers: { "Foo": "bar" }, body: "My body" }'
      )
    }

    const headers: Types.RequestHeaders = {}

    if (this.key) {
      // Authenticate the request with the provided secret key
      const authentication = 'Basic ' + Buffer.from(this.key + ':').toString('base64')
      headers['Authorization'] = authentication
    }

    const url = toURL(this.origin, `/api/${this.integration}`, endpoint, parameters.query)

    return fetch(url.toString(), {
      method,
      headers: cleanHeaders(headers),
      body: parameters && parameters.body
    })
  }
}

/**
 * Pizzly(JS) > Integration
 */

import PizzlyConnect from './connect'
import Types from './types'

export default class PizzlyIntegration {
  private key: string
  private integration: string
  private options: Types.IntegrationOptions = {}
  private origin: string

  constructor(integration: string, options: Types.IntegrationOptions, key: string, origin: string) {
    this.integration = integration
    this.options = options
    this.origin = origin
    this.key = key
  }

  /**
   * `auth` set authId so that API calls are performed with the given identity
   */

  public auth = (authId: string) =>
    new PizzlyIntegration(this.integration, { ...this.options, authId }, this.key, this.origin)

  /**
   * `setup` specify which setupId to use when calling Integration service
   */

  public setup = (setupId: string) =>
    new PizzlyIntegration(this.integration, { ...this.options, setupId }, this.key, this.origin)

  /**
   * `connect` triggers an OAuth dance for that user
   */

  public connect(options?: Types.ConnectOptions) {
    const connectOptions = { ...this.options, ...(options || {}) }
    const connect = new PizzlyConnect(this.integration, connectOptions, this.key, this.origin)
    return connect.trigger()
  }

  /**
   * `get` perform get request to integration service
   */

  public get = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('GET', endpoint, parameters)
  }

  /**
   * `head` perform head request to integration service
   */

  public head = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('HEAD', endpoint, parameters)
  }

  /**
   * `post` perform post request to integration service
   */

  public post = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('POST', endpoint, parameters)
  }

  /**
   * `put` perform put request to integration service
   */

  public put = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('PUT', endpoint, parameters)
  }

  /**
   * `delete` perform delete request to integration service
   */

  public delete = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('DELETE', endpoint, parameters)
  }

  /**
   * `patch` perform patch request to integration service
   */

  public patch = (endpoint: string, parameters?: Types.RequestParameters) => {
    return this.request('PATCH', endpoint, parameters)
  }

  /**
   * Make the HTTP request
   * (using Fetch behind the scene)
   */

  public request = (method: Types.RequestMethod, endpoint: string, parameters: Types.RequestParameters = {}) => {
    if (parameters && typeof parameters !== 'object') {
      throw new Error(
        'Unable to trigger API request. Request parameters should be an object in the form "{ headers: { "Foo": "bar" }, body: "My body" }'
      )
    }

    const headers: Types.RequestHeaders = {
      'Pizzly-Auth-Id': this.options.authId!,
      'Pizzly-Setup-Id': this.options.setupId!
    }

    if (parameters && parameters.headers) {
      for (const key in parameters.headers) {
        headers[`Pizzly-Proxy-${key}`] = parameters.headers[key]
      }
    }

    const url = this.toURL(this.origin, `/proxy/${this.integration}`, endpoint, this.key, parameters.query)
    const fetch = window.fetch

    return fetch(url.toString(), {
      method,
      headers: this.cleanHeaders(headers),
      body: parameters && parameters.body
    })
  }

  /**
   * Helper to build a new URL from different params
   */

  private toURL(
    origin: string,
    baseURL: string,
    endpoint: string,
    key: string,
    queryString?: Types.RequestQueryString
  ): URL {
    const removeLeadingSlash = (text: string) => {
      return text.replace(/^\//, '')
    }

    const removeTrailingSlash = (text: string) => {
      return text.replace(/\/$/, '')
    }

    const urlParts: string[] = []
    urlParts.push(removeTrailingSlash(origin))
    urlParts.push(removeLeadingSlash(removeTrailingSlash(baseURL)))
    urlParts.push(removeLeadingSlash(endpoint))

    const url = new URL(urlParts.join('/'))

    if (key) {
      // Authenticate the request with the provided publishable key
      url.searchParams.append('pizzly_pkey', key)
    }

    if (queryString) {
      Object.keys(queryString).forEach(key => url.searchParams.append(key, String(queryString[key])))
    }

    return url
  }

  /**
   * Helper to remove all undefined keys
   * @param obj {object}
   */

  private cleanHeaders(obj: Record<string, any>) {
    return Object.keys(obj).reduce((acc, key: string) => {
      if (obj[key] !== undefined) {
        acc[key] = obj[key]
      }
      return acc
    }, {} as Record<string, any>)
  }
}

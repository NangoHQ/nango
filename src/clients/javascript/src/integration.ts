/**
 * Pizzly(JS) > Integration
 */

import Types from './types'

export default class PizzlyIntegration {
  private integration: string
  private options: Types.IntegrationOptions = {}
  private origin: string

  constructor(integration: string, options: Types.IntegrationOptions, origin: string) {
    this.integration = integration
    this.options = options
    this.origin = origin
  }

  /**
   * `auth` set authId so that API calls are performed with the given identity
   */

  public auth = (authId: string) => new PizzlyIntegration(this.integration, { ...this.options, authId }, this.origin)

  /**
   * `setup` specify which setupId to use when calling Integration service
   */

  public setup = (setupId: string) => new PizzlyIntegration(this.integration, { ...this.options, setupId }, this.origin)

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
   * (using axios behind the scene)
   */

  private request = (method: Types.RequestMethod, endpoint: string, parameters: Types.RequestParameters = {}) => {
    if (parameters && typeof parameters !== 'object') {
      throw new Error(
        'Unable to trigger API request. Request parameters should be an object in the form "{ headers: { "Foo": "bar" }, body: "My body" }'
      )
    }
    console.log(this.options)

    const headers: Types.RequestHeaders = {
      'Pizzly-Auth-Id': this.options.authId!,
      'Pizzly-Setup-Id': this.options.setupId!
      // TODO - 'Pizzly-Publishable-Key': this.key
    }

    if (parameters && parameters.headers) {
      for (const key in parameters.headers) {
        headers[`Pizzly-Proxy-${key}`] = parameters.headers[key]
      }
    }

    const url = this.toURL(this.origin, `/proxy/${this.integration}`, endpoint, parameters.query)
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

  private toURL(origin: string, baseURL: string, endpoint: string, queryString?: Types.RequestQueryString): URL {
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

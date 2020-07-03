/**
 * Pizzly(JS) - The OAuth helper.
 */

import PizzlyConnect from './connect'
import PizzlyIntegration from './integration'
import Types from './types'

export default class Pizzly {
  readonly key: string = ''
  readonly origin: string = ''

  /**
   * Initialize Pizzly
   *
   * const pizzly = new Pizzly()
   * const pizzly = new Pizzly({ host: "my-pizzly-instance.example.org" })
   * const pizzly = new Pizzly({ host: "my-pizzly-instance.example.org", publishableKey: PUBLISHABLE_KEY })
   */

  constructor(
    options?: { host?: string; publishableKey?: string } | string,
    legacyOptions?: { protocol?: string; hostname?: string; port?: number | string } | string
  ) {
    if (!window) {
      const errorMessage =
        "Couldn't initialize Pizzly. The window object is undefined. Are you using Pizzly from a browser?"
      throw new Error(errorMessage)
    }

    /**
     * Handle legacy usage (from old Bearer):
     * bearer-js had only one argument (the publishableKey)
     * and the host was hardcoded (SaaS tool).
     * Usage was similar to: new Bearer(PUBLISHABLE_KEY)
     */

    if (options && typeof options === 'string') {
      this.key = options // Legacy usage of Bearer, which was "new Bearer(PUBLISHABLE_KEY)"
    }

    if (legacyOptions && typeof legacyOptions === 'string') {
      this.origin = new URL(legacyOptions).href
    } else if (legacyOptions && typeof legacyOptions === 'object') {
      const legacyProtocol = legacyOptions.protocol || window.location.protocol
      const legacyPort = legacyOptions.port || window.location.port || 80
      const legacyHostname = legacyOptions.hostname || window.location.hostname
      this.origin = new URL(legacyProtocol + '//' + legacyHostname + ':' + legacyPort).href
    }

    /**
     * Handle new usage of pizzly-js:
     * > new Pizzly()
     * or
     * > new Pizzly({ host: '...', publishableKey: '...' })
     */

    if (!this.origin) {
      const host = typeof options === 'object' && options.host

      if (!host) {
        // Inherit host from window.location
        const protocol = window.location.protocol
        const hostname = window.location.hostname
        const port = window.location.port || 80
        const host = hostname + (Number(port) !== 80 ? `:${port}` : '')
        this.origin = new URL(protocol + '//' + host).href
      } else {
        if (host.startsWith('http://') || host.startsWith('https://')) {
          // Host option accepts full URL
          this.origin = new URL(host).href
        } else {
          // or only the right host
          const protocol = window.location.protocol
          this.origin = new URL(protocol + '//' + host).href
        }
      }
    }

    if (!this.key) {
      const publishableKey = typeof options === 'object' && options.publishableKey

      if (publishableKey) {
        this.key = publishableKey
      }
    }

    return this
  }

  /**
   * Connect
   */

  public connect(integration: string, options?: Types.ConnectOptions) {
    const connect = new PizzlyConnect(integration, options || {}, this.key, this.origin)
    return connect.trigger()
  }

  /**
   * Integration
   */

  public integration(integration: string, options?: Types.IntegrationOptions) {
    return new PizzlyIntegration(integration, options || {}, this.key, this.origin)
  }
}

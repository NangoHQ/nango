/**
 * Pizzly(JS) - The OAuth helper.
 */

import PizzlyConnect from './connect'
import PizzlyIntegration from './integration'
import Types from './types'

export default class Pizzly {
  readonly key: string
  readonly protocol: string
  readonly hostname: string
  readonly port: number | string
  private origin!: string

  /**
   * Initialize Pizzly
   *
   * const pizzly = new Pizzly()
   * const pizzly = new Pizzly(PUBLISHABLE_KEY)
   * const pizzly = new Pizzly(PUBLISHABLE_KEY, options)
   */

  constructor(key: string, options?: { protocol?: string; hostname?: string; port?: number | string } | string) {
    if (!window) {
      throw new Error("Couldn't connect. The window object is undefined. Are you using Pizzly from a browser?")
    }

    this.key = key

    if (options && typeof options === 'string') {
      const origin = new URL(options)
      this.protocol = origin.protocol
      this.hostname = origin.hostname
      this.port = origin.port
    } else {
      this.protocol = (typeof options === 'object' && options.protocol) || window.location.protocol
      this.hostname = (typeof options === 'object' && options.hostname) || window.location.hostname
      this.port = (typeof options === 'object' && options.port) || window.location.port
    }

    this.setOrigin(this.protocol, this.hostname, this.port)

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

  /**
   * Save config
   */

  // public saveConfig() {}

  /**
   * Some helpers
   */

  private setOrigin(protocol: string, hostname: string, port: number | string): void {
    const host = hostname + (Number(port) !== 80 ? `:${port}` : '')
    this.origin = protocol + '//' + host
  }
}

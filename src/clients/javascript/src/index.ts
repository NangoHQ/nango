/**
 * Pizzly(JS) - The OAuth helper.
 */

import PizzlyConnect from './connect'
import { integration } from './integration'
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
   * const pizzly = new Pizzly(PUBLISHABLE_KEY)
   * const pizzly = new Pizzly(PUBLISHABLE_KEY, options)
   */

  constructor(key: string, options?: { protocol?: string; hostname?: string; port?: number | string }) {
    if (!key) {
      throw new Error("Pizzly JS can't be initialized: missing publishable key.")
    }

    if (!window) {
      throw new Error("Couldn't connect. The window object is undefined. Are you using connect from a browser?")
    }

    this.key = key

    this.protocol = (options && options.protocol) || window.location.protocol
    this.hostname = (options && options.hostname) || window.location.hostname
    this.port = (options && options.port) || window.location.port
    this.setOrigin(this.protocol, this.hostname, this.port)

    return this
  }

  /**
   * Connect
   */

  public connect(integration: string, options?: Types.ConnectOptions) {
    const connect = new PizzlyConnect(integration, options || {}, this.origin)
    return connect.trigger()
  }

  /**
   * Integration
   */

  public integration = integration

  /**
   * Save config
   */

  public saveConfig() {}

  /**
   * Some helpers
   */

  private setOrigin(protocol: string, hostname: string, port: number | string): void {
    const host = hostname + (Number(port) !== 80 ? `:${port}` : '')
    this.origin = protocol + '//' + host
  }
}

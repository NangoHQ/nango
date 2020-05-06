/**
 * Pizzly(JS) > Connect
 *
 * @param integration (string) - The integration to connect with
 * @param options (object) - Connect options (see below)
 * @usage
 * - pizzly.connect('github')
 * - pizzly.connect('github', { authdId: "213d9ee..." })
 * - pizzly.connect('github', { configId: "813bca..." })
 * - pizzly.connect('github', { setupId: "813bca..." }) // legacy, use configId
 * - pizzly.connect('github', { authId: "213d9ee...", configId: "813bca..." })
 */

import Types from './types'

export default class PizzlyConnect {
  private integration: string
  private options?: Types.ConnectOptions
  private status: AuthorizationStatus = AuthorizationStatus.IDLE
  private origin: string

  constructor(integration: string, options: Types.ConnectOptions, origin: string) {
    if (!integration) {
      throw new Error("Couldn't connect. Missing argument: integration (string)")
    }

    if (!window) {
      throw new Error("Couldn't connect. The window object is undefined. Are you using connect from a browser?")
    }

    this.integration = integration
    this.options = options
    this.origin = origin
  }

  /**
   * Trigger the connection by opening a window modal (aka popup)
   * @returns Promise
   */

  trigger(): Promise<Types.ConnectSuccess> {
    const query = this.connectOptionsToQueryString(this.options)
    const url = `${this.origin}/auth/${this.integration}?${query}`

    return new Promise((resolve, reject) => {
      const handler = (e?: MessageEvent) => {
        if (this.status !== AuthorizationStatus.BUSY) {
          return
        }

        this.status = AuthorizationStatus.DONE

        if (!e) {
          const errorMessage =
            'Authorization cancelled. The user has likely interrupted the process by closing the modal.'
          return reject(new Error(errorMessage))
        }

        if (!e.data) {
          const errorMessage = 'Authorization failed. The response is not supported.'
          return reject(new Error(errorMessage))
        }

        const { data: event } = e

        if (event.eventType === 'AUTHORIZATION_SUCEEDED') {
          return resolve(event.data)
        } else if (event.eventType === 'AUTHORIZATION_FAILED') {
          return reject(event.data)
        }

        reject(new Error('Authorization failed. The response type is not supported'))
      }

      // Add an event listener on authorization modal
      //
      // Note: this adds one event listener for each authorization process.
      // In an application doing lots of connect, this can cause a memory issue.
      window.addEventListener('message', handler, false)

      // Save authorization status (for handler)
      this.status = AuthorizationStatus.BUSY

      // Open authorization modal
      const modal = new AuthorizationModal(url)
      modal.open()
      modal.addEventListener('close', handler)
    })
  }

  /**
   * Helper to convert the connect options into a query-string
   * e.g. authId=...&setupId=...
   */

  connectOptionsToQueryString(options?: Types.ConnectOptions): string {
    let query: string[] = []

    if (!options) {
      return ''
    }

    if (typeof options.authId === 'string') {
      query.push(`authId=${options.authId}`)
    }

    if (typeof options.setupId === 'string') {
      query.push(`setupId=${options.setupId}`)
    }

    return query.join('&')
  }
}

enum AuthorizationStatus {
  IDLE,
  BUSY,
  DONE
}

/**
 * AuthorizationModal class
 */

class AuthorizationModal {
  private url: string
  private features: { [key: string]: string | number }
  private width = 500
  private height = 600
  private modal!: Window | null

  constructor(url: string) {
    // Window modal URL
    this.url = url

    const { left, top, computedWidth, computedHeight } = this.layout(this.width, this.height)

    // Window modal features
    this.features = {
      width: computedWidth,
      height: computedHeight,
      top,
      left,
      scrollbars: 'yes',
      resizable: 'yes',
      // noopener: 'no'
      //
      // Note: using "noopener=yes" seems safer here, as the modal will run on third-party websites.
      // But we need detect if the modal has been closed by the user, during the authorization process,
      // To do so, we are polling the modal status of the modal (using the read-only closed property).
      // If we can find a workaround that provides both the ability to use "noopener=yes"
      // and detect the modal close status, it will be safer to proceed so.
      status: 'no',
      toolbar: 'no',
      location: 'no',
      copyhistory: 'no',
      menubar: 'no',
      directories: 'no'
    }
  }

  /**
   * The modal is expected to be in the center of the screen.
   */

  layout(expectedWidth: number, expectedHeight: number) {
    const screenWidth = window.screen.width
    const screenHeight = window.screen.height
    const left = screenWidth / 2 - expectedWidth / 2
    const top = screenHeight / 2 - expectedHeight / 2

    const computedWidth = Math.min(expectedWidth, screenWidth)
    const computedHeight = Math.min(expectedHeight, screenHeight)

    return { left: Math.max(left, 0), top: Math.max(top, 0), computedWidth, computedHeight }
  }

  /**
   * Open the modal
   */

  open() {
    const url = this.url
    const windowName = ''
    const windowFeatures = this.featuresToString()
    this.modal = window.open(url, windowName, windowFeatures)
    return this.modal
  }

  /**
   * Add event listener on the modal
   */

  addEventListener(eventType: string, handler: () => any): void {
    if (eventType !== 'close') {
      return
    }

    if (!this.modal) {
      handler()
      return
    }

    const interval = window.setInterval(() => {
      if (!this.modal || this.modal.closed) {
        handler()
        window.clearInterval(interval)
      }
    }, 100)
  }

  /**
   * Helper to convert the features object of this class
   * to the comma-separated list of window features required
   * by the window.open() function.
   */

  featuresToString(): string {
    const features = this.features
    const featuresAsString: string[] = []

    for (let key in features) {
      featuresAsString.push(key + '=' + features[key])
    }

    return featuresAsString.join(',')
  }
}

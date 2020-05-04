const Pizzly = require('../dist/index.umd.js')

describe('Connect', () => {
  window.addEventListener = jest.fn()
  window.open = jest.fn(() => {
    return { closed: false }
  })

  const publishableKey = 'foo'
  const hostname = 'bar'
  const integration = 'github'

  const pizzly = new Pizzly(publishableKey, hostname)

  describe('Initialization', () => {
    it('is a function', () => {
      expect(pizzly.connect).toBeInstanceOf(Function)
    })

    it('accepts an integration argument', () => {
      expect(() => {
        return pizzly.connect(integration)
      }).toBeInstanceOf(Function)
    })

    it('must have an integration argument', () => {
      expect(() => {
        return pizzly.connect()
      }).toThrowError()
    })

    it('accepts an (optional) options argument', () => {
      expect(() => {
        return pizzly.connect(integration, {})
      }).toBeInstanceOf(Function)
    })
  })

  describe('Window interaction', () => {
    it('opens a popup (window modal)', () => {
      expect.assertions(1)
      pizzly.connect(integration).catch()
      return expect(window.open).toHaveBeenCalled()
    })

    // More tests to add on that:
    // - it opens a popup with this URL
    // - it opens a popup with this size
    // - it opens a popup with this position

    it('listens to message', () => {
      expect.assertions(1)
      const handler = expect.any(Function)
      pizzly.connect(integration).catch()
      return expect(window.addEventListener).toHaveBeenCalledWith('message', handler, false)
    })
  })

  describe('Return values', () => {
    // More test to add here:
    // it returns a promise
    // it returns an object on promise.resolve
    // it returns an error on promise.reject
  })
})

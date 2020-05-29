import Pizzly from '../src/index'

describe('Connect', () => {
  beforeAll(() => {
    window.addEventListener = jest.fn()
    // @ts-ignore
    window.open = jest.fn(() => {
      return { closed: false }
    })
  })

  const publishableKey = 'foo'
  const integration = 'github'

  function setup() {
    return new Pizzly(publishableKey)
  }

  describe('connect', () => {
    it('is a function', () => {
      const pizzly = setup()

      expect(pizzly.connect).toBeInstanceOf(Function)
    })

    it('accepts an integration argument', () => {
      const pizzly = setup()

      expect(pizzly.connect(integration)).toBeInstanceOf(Promise)
    })

    it('must have an integration argument', () => {
      const pizzly = setup()
      expect(() => {
        // @ts-expect-error
        return pizzly.connect()
      }).toThrowError()
    })

    it('accepts an (optional) options argument', () => {
      const pizzly = setup()

      expect(pizzly.connect(integration, {})).toBeInstanceOf(Promise)
    })
  })

  it('opens a popup (window modal)', () => {
    const pizzly = setup()
    expect.assertions(1)

    pizzly.connect(integration).catch()

    expect(window.open).toHaveBeenCalled()
  })

  // More tests to add on that:
  // - it opens a popup with this URL
  // - it opens a popup with this size
  // - it opens a popup with this position

  it('listens to message', () => {
    const pizzly = setup()
    expect.assertions(1)

    pizzly.connect(integration).catch()

    expect(window.addEventListener).toHaveBeenCalledWith('message', expect.any(Function), false)
  })

  describe('Return values', () => {
    // More test to add here:
    // it returns a promise
    // it returns an object on promise.resolve
    // it returns an error on promise.reject
  })
})

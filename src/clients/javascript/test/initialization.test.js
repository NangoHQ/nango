const Pizzly = require('../dist/index.umd.js')

describe('Pizzly class', () => {
  const publishableKey = 'foo'
  const emptyOptions = {}
  const invalidOptions = { foo: 'bar' }
  const validOptions = { hostname: 'example.org' }

  describe('constructor', () => {
    it('can be instanciated', () => {
      expect(Pizzly).toBeInstanceOf(Function)
    })

    it('accepts no arguments', () => {
      expect(() => {
        new Pizzly()
      }).not.toThrowError()
    })

    it('accepts one argument', () => {
      expect(() => {
        new Pizzly(publishableKey)
      }).toBeInstanceOf(Function)
    })

    it('accepts two arguments', () => {
      expect(() => {
        new Pizzly(publishableKey, emptyOptions)
      }).toBeInstanceOf(Function)
    })

    it('accepts invalid options', () => {
      expect(() => {
        new Pizzly(publishableKey, invalidOptions)
      }).toBeInstanceOf(Function)
    })

    it('accepts a string as options (origin)', () => {
      const pizzly = new Pizzly(publishableKey, 'https://example.org:4242')
      expect(pizzly.hostname).toBe('example.org')
      expect(pizzly.protocol).toBe('https:')
      expect(pizzly.port).toBe('4242')
    })
  })

  describe('methods', () => {
    const pizzly = new Pizzly(publishableKey, validOptions)

    it('has a "connect" method', () => {
      expect(pizzly.connect).toBeInstanceOf(Function)
    })

    it('has an "integration" method', () => {
      expect(pizzly.integration).toBeInstanceOf(Function)
    })

    // it('has a "saveConfig" method', () => {
    //   expect(pizzly.saveConfig).toBeInstanceOf(Function)
    // })
  })
})

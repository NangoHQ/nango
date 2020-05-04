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

    it('throws an error if no arguments provided', () => {
      expect(() => {
        new Pizzly()
      }).toThrowError()
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

    it('throws an error if the first argument is undefined', () => {
      expect(() => {
        new Pizzly(undefined)
      }).toThrowError()
    })

    it('accepts invalid options', () => {
      expect(() => {
        new Pizzly(publishableKey, invalidOptions)
      }).toBeInstanceOf(Function)
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

    it('has a "saveConfig" method', () => {
      expect(pizzly.saveConfig).toBeInstanceOf(Function)
    })
  })
})

import { Pizzly } from '../src/index'

describe('Pizzly class', () => {
  describe('constructor', () => {
    it('can be instanciated', () => {
      expect(Pizzly).toBeInstanceOf(Function)
    })

    it('expect options', () => {
      expect(() => {
        // @ts-expect-error
        new Pizzly()
      }).toThrowError()
    })

    it('expect non-empty options', () => {
      expect(() => {
        // @ts-expect-error
        new Pizzly({})
      }).toThrowError()
    })

    it('accepts an host option', () => {
      expect(() => {
        new Pizzly({ host: 'example.org' })
      }).toBeInstanceOf(Function)
    })

    it('accepts an host option as an URL', () => {
      expect(() => {
        new Pizzly({ host: 'https://example.org' })
      }).not.toThrowError()
    })

    it('accepts both an host and a secretKey options', () => {
      expect(() => {
        new Pizzly({ host: 'https://example.org', secretKey: 'shhh!' })
      }).not.toThrowError()
    })

    it('requires the host option', () => {
      expect(() => {
        // @ts-expect-error
        new Pizzly({ secretKey: 'shhh!' })
      }).toThrowError()
    })
  })

  describe('integration', () => {
    const pizzly = new Pizzly({ host: 'example.org' })

    it('has an "integration" method', () => {
      expect(pizzly.integration).toBeInstanceOf(Function)
    })

    it('accepts an integration-name', () => {
      expect(() => {
        return pizzly.integration('foo-bar')
      }).toBeInstanceOf(Function)
    })
    it('expects an integration-name', () => {
      expect(() => {
        return pizzly.integration('')
      }).toThrowError()
    })
  })
})

import Pizzly from '../src/index'

describe('Pizzly class', () => {
  describe('constructor', () => {
    it('is a function', () => {
      expect(new Pizzly()).toBeInstanceOf(Pizzly)
    })

    it('accepts no arguments', () => {
      expect(() => {
        new Pizzly()
      }).not.toThrowError()
    })

    it('accepts an host option', () => {
      expect(() => {
        new Pizzly({ host: 'example.org' })
      }).toBeInstanceOf(Function)
    })

    it('accepts a publishableKey option', () => {
      expect(() => {
        new Pizzly({ publishableKey: 'xxx' })
      }).toBeInstanceOf(Function)
    })

    it('accepts both an host option and a publishableKey option', () => {
      expect(() => {
        new Pizzly({ host: 'example.org', publishableKey: 'xxx' })
      }).toBeInstanceOf(Function)
    })

    it('infers the origin from window.location', () => {
      const pizzly = new Pizzly()
      expect(pizzly.origin).toBe(new URL(window.location.href).href)
    })

    it('computes the origin from the host', () => {
      const host = 'example.org:4242'
      const origin = window.location.protocol + '//' + host
      const pizzly = new Pizzly({ host })
      expect(pizzly.origin).toBe(new URL(origin).href)
    })

    it('expects the origin to match the full host provided', () => {
      const origin = 'https://example.org:4242'
      const pizzly = new Pizzly({ host: origin })
      expect(pizzly.origin).toBe(new URL(origin).href)
    })

    // Handle legacy initialization
    describe('legacy', () => {
      const publishableKey = 'foo'

      const protocol = 'https:'
      const hostname = 'example.org'
      const port = 4242

      it('accepts a (legacy) publishableKey argument', () => {
        expect(() => {
          new Pizzly(publishableKey)
        }).toBeInstanceOf(Function)
      })

      it('accepts both a (legacy) publishableKey argument and (legacy) options', () => {
        expect(() => {
          new Pizzly(publishableKey, {})
        }).toBeInstanceOf(Function)
      })

      it('infers the origin from window.location', () => {
        const pizzly = new Pizzly(publishableKey, {})
        expect(pizzly.origin).toBe(new URL(window.location.href).href)
      })

      it('computes the origin from the (legacy) options', () => {
        const origin = protocol + '//' + hostname + ':' + port
        const pizzly = new Pizzly(publishableKey, { protocol, hostname, port })
        expect(pizzly.origin).toBe(new URL(origin).href)
      })

      it('accepts a string as (legacy) options', () => {
        const origin = 'https://example.org:4242'
        const pizzly = new Pizzly(publishableKey, origin)
        expect(pizzly.origin).toBe(new URL(origin).href)
      })
    })
  })
})

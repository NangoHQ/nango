import { Pizzly } from '../src/index'

describe('Pizzly API', () => {
  describe('api', () => {
    const pizzly = new Pizzly({ host: 'example.org', secretKey: 'myKey' })

    it('has an "api" method', () => {
      expect(pizzly.api).toBeInstanceOf(Function)
    })

    it('accepts an integration-name', () => {
      expect(() => {
        return pizzly.api('foo-bar')
      }).toBeInstanceOf(Function)
    })
    it('expects an integration-name', () => {
      expect(() => {
        return pizzly.api('')
      }).toThrowError()
    })

    it('expects basic api url are ok', async () => {
      const apiClient = pizzly.api('foo-bar')

      // Get integration
      const integration = await apiClient.get('/')
      expect(integration.url).toEqual('https://example.org/api/foo-bar/')

      // Configurations
      const response = await apiClient.get('configurations')
      expect(response.url).toEqual('https://example.org/api/foo-bar/configurations')

      const resp1 = await apiClient.put('configurations/72184458-7751-41fe-8dcc-0251ab2cc578', {
        body: { credentials: { clientId: 'abcd***************', clientSecret: '1234***********************' } }
      })
      expect(resp1.url).toEqual('https://example.org/api/foo-bar/configurations/72184458-7751-41fe-8dcc-0251ab2cc578')

      const resp2 = await apiClient.delete('configurations/72184458-7751-41fe-8dcc-0251ab2cc578')
      expect(resp2.url).toEqual('https://example.org/api/foo-bar/configurations/72184458-7751-41fe-8dcc-0251ab2cc578')

      // Authentifications
      const resp3 = await apiClient.get('authentifications')
      expect(resp3.url).toEqual('https://example.org/api/foo-bar/authentifications')

      const resp4 = await apiClient.post('authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac/refresh')
      expect(resp4.url).toEqual(
        'https://example.org/api/foo-bar/authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac/refresh'
      )

      const resp5 = await apiClient.delete('authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac')
      expect(resp5.url).toEqual(
        'https://example.org/api/foo-bar/authentifications/1994cc00-a4d6-11ea-9187-b798bad9d2ac'
      )
    })
  })
})

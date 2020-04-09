import { OAuth } from 'oauth'

import { expandRequestConfig, RequestConfig } from './request-config'
import { EAuthType, OAuth1SignatureMethod, OAuth1AuthDetails, AuthDetails, BasicAuthDetails } from '../auth/v3/types'

jest.mock('oauth')

describe('expandRequestConfig', () => {
  const headers = {
    authorization: 'Bearer ${ auth.password }',
    h2: 'Some ${headers.some_value}'
  }

  const connectParams = {
    conParam: 'test-con-param'
  }

  const params = {
    user: '${auth.username}',
    p2: '${  headers.other_value  }',
    p3: '${connectParams.conParam}'
  }

  const defaultRequestConfig: RequestConfig = {
    headers,
    params,
    baseURL: 'https://${headers.instance}.example.com/${auth.username}'
  }

  const basicAuth = { username: 'test-user', password: 'test-pass' }
  const requestHeaders = { some_value: 'test-some-value', other_value: 'test-other-value', instance: 'test-instance' }

  const setup = ({
    auth = basicAuth,
    authType = EAuthType.NoAuth,
    requestConfig = defaultRequestConfig
  }: { auth?: AuthDetails; authType?: EAuthType; requestConfig?: RequestConfig } = {}) => ({
    auth,
    authType,
    connectParams,
    requestConfig,
    headers: requestHeaders,
    method: 'GET',
    path: '/super-secure'
  })

  it('fills in the variables', () => {
    const params = setup()

    expect(expandRequestConfig(params)).toMatchSnapshot()
  })

  describe('baseURL', () => {
    it('returns an error if it contains an invalid variable', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, baseURL: 'http://${invalid}.example.com' }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })

    it('returns an error if a required header is missing', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, baseURL: 'http://${headers.missing}.example.com' }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })
  })

  describe('headers', () => {
    it('returns an error if one contains an invalid variable', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, headers: { test: 'Bearer ${invalid}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })

    it('returns an error if a required header is missing', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, headers: { test: 'Bearer ${headers.missing}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })

    it('returns an error if a required connect param is missing', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, headers: { test: 'Bearer ${connectParams.missing}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })
  })

  describe('params', () => {
    it('returns an error if one contains an invalid variable', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, params: { test: 'Bearer ${invalid}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })

    it('returns an error if a required header is missing', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, params: { test: 'Bearer ${headers.missing}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })

    it('returns an error if a required connect param is missing', () => {
      const params = setup({
        requestConfig: { ...defaultRequestConfig, params: { test: 'Bearer ${connectParams.missing}' } }
      })

      expect(() => expandRequestConfig(params)).toThrowErrorMatchingSnapshot()
    })
  })

  describe('when authType is OAuth1', () => {
    const oauth1Creds = 'test-oauth1-creds'
    // const authHeader = jest.fn(() => `OAuth ${oauth1Creds}`)

    const setupOAuth1 = ({ baseURL = 'https://api.example.com' }: { baseURL?: string } = {}) => {
      const requestConfig = {
        baseURL,
        headers: {
          test: '${auth.oauth1}'
        },
        params: {}
      }

      return setup({
        requestConfig,
        auth: {
          signatureMethod: OAuth1SignatureMethod.HmacSha1,
          consumerKey: 'test-consumer-key',
          consumerSecret: 'test-consumer-secret',
          accessToken: 'test-access-token',
          tokenSecret: 'test-token-secret'
        } as OAuth1AuthDetails,
        authType: EAuthType.OAuth1
      })
    }

    beforeEach(() => {
      // mocked(OAuth)
      //   .mockImplementationOnce(() => ({ authHeader }))
      //   .mockClear()
      // authHeader.mockClear()
    })

    it('sets `auth.oauth1` to the encoded credentials for the auth header', async () => {
      const params = setupOAuth1()

      expect(expandRequestConfig(params).headers.test).toBe(oauth1Creds)
      expect(OAuth).toMatchSnapshot()
    })

    it('forms the correct URL when the baseURL ends in a slash', async () => {
      const params = setupOAuth1({ baseURL: 'https://api.example.com/path/' })

      expandRequestConfig(params)

      // expect(authHeader.mock.calls[0][0]).toBe('https://api.example.com/path/super-secure')
    })
  })

  describe('when authType is Basic', () => {
    const setupBasic = (usePassword: boolean) => {
      const requestConfig = {
        baseURL: '',
        headers: {
          test: '${auth.basic}'
        },
        params: {}
      }

      return setup({
        requestConfig,
        auth: {
          username: 'test-user',
          password: usePassword ? 'test-pass' : undefined
        } as BasicAuthDetails,
        authType: EAuthType.NoAuth
      })
    }

    it('sets `auth.basic` to the encoded credentials for the auth header', async () => {
      const params = setupBasic(true)

      expect(expandRequestConfig(params).headers.test).toBe('dGVzdC11c2VyOnRlc3QtcGFzcw==')
    })

    it('supports empty passwords', async () => {
      const params = setupBasic(false)

      expect(expandRequestConfig(params).headers.test).toBe('dGVzdC11c2VyOg==')
    })
  })
})

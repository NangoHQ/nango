import { MiddlewareTestHarness } from '../../../../../../tests/utils'
import { authenticate } from './auth-code'
import { TAuthenticateRequest, EAuthType, TIntegrationConfig } from '../../types'
import { getCodeRedirectURL } from '../../../clients/oauth2'
import { responseToCredentials } from './common'

jest.mock('../../../../clients/oauth2')
jest.mock('./common')

const requiredIntegrationConfig = {
  authType: EAuthType.OAuth2,
  authorizationURL: 'https://example.com/auth',
  tokenURL: 'https://example.com/token',
  config: {}
}

const fullIntegrationConfig = {
  ...requiredIntegrationConfig,
  authorizationParams: {
    someAuthParam: 'test-ap'
  },
  tokenParams: {
    someTokenParam: 'test-tp'
  },
  config: {
    scope: ['test-scope1', 'test-scope2'],
    state: 'test-state'
  }
}

const setupDetails = {
  clientId: 'test-client-id',
  clientSecret: 'test-client-secret'
}

describe('authenticate', () => {
  const setup = (integrationConfig: TIntegrationConfig = fullIntegrationConfig) =>
    new MiddlewareTestHarness<TAuthenticateRequest>({
      configureRequest: req => {
        req.integrationConfig = integrationConfig
        req.setupDetails = setupDetails
      },
      testMiddleware: authenticate
    })

  describe('when connecting', () => {
    const redirectURL = 'https://example.com/auth?with_params=true'

    it('redirects to the authorization url with correct params', async () => {
      // mocked(getCodeRedirectURL)
      //   .mockReturnValueOnce(redirectURL)
      //   .mockClear()

      await setup()
        .get()
        .expect(302)
        .expect('Location', redirectURL)

      expect(getCodeRedirectURL).toMatchSnapshot()
    })
  })

  describe('when called back by the third party', () => {
    const accessToken = 'test-access-token'
    const refreshToken = 'test-refresh-token'
    const idToken = 'test-id-token'
    const expiresIn = 1234

    const tokenResult = { accessToken: 'response-access-token', decodedResponse: { body: { hey: 'there' } } }
    const credentials = { accessToken, expiresIn, idToken, refreshToken }

    beforeAll(() => {
      // mocked(getTokenWithCode).mockResolvedValue(tokenResult)
      // mocked(responseToCredentials).mockReturnValue(credentials)
    })

    beforeEach(() => {
      // mocked(responseToCredentials).mockClear()
    })

    it('exchanges the code for tokens and stores them on the request', async () => {
      const test = setup()

      await test
        .get()
        .query('code=test-code')
        .expect(200)

      expect(responseToCredentials).toHaveBeenCalledWith(tokenResult)
      expect(test.req.credentials).toEqual(credentials)
    })

    it('stores the token call response data on the request', async () => {
      const test = setup()

      await test
        .get()
        .query('code=test-code')
        .expect(200)

      expect(test.req.tokenResponse).toEqual(tokenResult.decodedResponse)
    })

    it('raises an AuthenticationFailed error if there is an error query parameter', async () => {
      const test = setup()
      await test
        .get()
        .query('error=test_code&error_description=oops')
        .expect(403)

      expect(test.err).toMatchSnapshot()
    })
  })
})

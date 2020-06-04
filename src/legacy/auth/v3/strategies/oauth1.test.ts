import nock from 'nock'
import { MiddlewareTestHarness, session } from '../../../../../tests/utils'
import { authenticate, fetchAuthDetails } from './oauth1'
import { TAuthenticateRequest, EAuthType, TIntegrationConfig, OAuth1SignatureMethod } from '../types'
import {
  // getSetupDetails,
  // getAuth,
  TOAuth1Payload
} from '../../clients/integrations'
import Integration from '../../../functions/integration'

jest.mock('../../../clients/integrations')

const requiredIntegrationConfig = {
  authType: EAuthType.OAuth1,
  requestTokenURL: 'https://example.com/requestToken',
  accessTokenURL: 'https://example.com/accessToken',
  userAuthorizationURL: 'https://example.com/auth',
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
  signatureMethod: 'PLAINTEXT'
}

const setupDetails = {
  consumerKey: 'test-consumer-key',
  consumerSecret: 'test-consumer-secret'
}

describe('authenticate', () => {
  const setup = (integrationConfig: TIntegrationConfig = fullIntegrationConfig) =>
    new MiddlewareTestHarness<TAuthenticateRequest>({
      configureRequest: req => {
        req.integrationConfig = integrationConfig
        req.setupDetails = setupDetails
      },
      setupMiddlewares: [session()],
      testMiddleware: authenticate
    })

  const mockRequestTokenReq = (requestBody = 'someTokenParam=test-tp') =>
    nock('https://example.com')
      .post('/requestToken', requestBody, {
        reqheaders: {
          'User-Agent': 'Pizzly',
          Authorization: new RegExp(
            'OAuth oauth_callback="https%3A%2F%2Fexample\\.com%2Fv2%2Fauth%2Fcallback",' +
              'oauth_consumer_key="test-consumer-key",oauth_nonce="w+",' +
              'oauth_signature_method="PLAINTEXT",oauth_timestamp="d+",oauth_version="1\\.0",' +
              'oauth_signature="test-consumer-secret%26"'
          )
        }
      })
      .reply(200, 'oauth_token=test-request-token&oauth_token_secret=test-request-token-secret')

  describe('when connecting', () => {
    it('obtains a request token', async () => {
      const reqTokenScope = mockRequestTokenReq()

      await setup().get()

      reqTokenScope.done()
    })

    it('redirects to the authorization url with the correct parameters', async () => {
      mockRequestTokenReq()

      await setup()
        .get()
        .expect(302)
        .expect(
          'Location',
          'https://example.com/auth?oauth_token=test-request-token&' +
            'oauth_callback=https%3A%2F%2Fexample.com%2Fv2%2Fauth%2Fcallback&someAuthParam=test-ap'
        )
    })

    it('works when optional config is not present', async () => {
      mockRequestTokenReq('')

      await setup(requiredIntegrationConfig)
        .get()
        .expect(302)
        .expect(
          'Location',
          'https://example.com/auth?oauth_token=test-request-token&' +
            'oauth_callback=https%3A%2F%2Fexample.com%2Fv2%2Fauth%2Fcallback'
        )
    })
  })

  describe('when called back by the third party', () => {
    const callbackSetup = async (integrationConfig?: TIntegrationConfig, tokenRequestBody?: string) => {
      const test = setup(integrationConfig)

      // Simulate connect request - needed to setup correct session state
      mockRequestTokenReq(tokenRequestBody)
      await test.get().expect(302)

      return test
    }

    const mockAccessTokenReq = () =>
      nock('https://example.com').post('/accessToken', '', {
        reqheaders: {
          'User-Agent': 'Pizzly',
          Authorization: new RegExp(
            'OAuth oauth_consumer_key ="test-consumer-key",oauth_nonce="w+",' +
              'oauth_signature_method="PLAINTEXT",oauth_timestamp="d+",' +
              'oauth_token="test-request-token",oauth_verifier="test-verifier",oauth_version="1.0",' +
              'oauth_signature="test-consumer-secret%26test-request-token-secret"'
          )
        }
      })

    it('exchanges the code for tokens and stores them in the request', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(
        200,
        'oauth_token=test-access-token&oauth_token_secret=test-access-token-secret&expires_in=1234'
      )

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(200)

      expect(test.req.credentials).toEqual({
        accessToken: 'test-access-token',
        tokenSecret: 'test-access-token-secret',
        consumerKey: 'test-consumer-key',
        consumerSecret: 'test-consumer-secret',
        expiresIn: 1234
      })
    })

    it('stores the token response data on the request', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(
        200,
        'oauth_token=test-access-token&oauth_token_secret=test-access-token-secret&expires_in=1234',
        { some: 'header-value' }
      )

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(200)

      expect(test.req.tokenResponse).toEqual({
        body: {
          oauth_token: 'test-access-token',
          oauth_token_secret: 'test-access-token-secret',
          expires_in: '1234'
        },
        headers: {
          some: 'header-value'
        }
      })
    })

    it('sets a default value for the expiry time if it is not returned', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(200, 'oauth_token=test-access-token&oauth_token_secret=test-access-token-secret')

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(200)

      expect(test.req.credentials).toEqual({
        accessToken: 'test-access-token',
        tokenSecret: 'test-access-token-secret',
        consumerKey: 'test-consumer-key',
        consumerSecret: 'test-consumer-secret',
        expiresIn: 0
      })
    })

    it('uses the default value for the expiry time if the returned value is not a number', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(
        200,
        'oauth_token=test-access-token&oauth_token_secret=test-access-token-secret&expires_in=invalid'
      )

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(200)

      expect(test.req.credentials).toEqual({
        accessToken: 'test-access-token',
        tokenSecret: 'test-access-token-secret',
        consumerKey: 'test-consumer-key',
        consumerSecret: 'test-consumer-secret',
        expiresIn: 0
      })
    })

    it('works when optional config is not present', async () => {
      const test = await callbackSetup(requiredIntegrationConfig, '')
      mockAccessTokenReq().reply(200, 'oauth_token=test-access-token&oauth_token_secret=test-access-token-secret')

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(200)

      expect(test.req.credentials).toEqual({
        accessToken: 'test-access-token',
        tokenSecret: 'test-access-token-secret',
        consumerKey: 'test-consumer-key',
        consumerSecret: 'test-consumer-secret',
        expiresIn: 0
      })
    })

    it('raises an AuthenticationFailed error if there is an error getting the access token', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(403, 'oops')

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(403)

      expect(test.err).toMatchSnapshot()
    })

    it('raises an AuthenticationFailed error if no access token was returned', async () => {
      const test = await callbackSetup()
      mockAccessTokenReq().reply(200, 'non_standard=error')

      await test
        .get()
        .query('oauth_token=test-request-token,oauth_verifier=test-verifier')
        .expect(403)

      expect(test.err).toMatchSnapshot()
    })
  })
})

describe('fetchAuthDetails', () => {
  const log = jest.fn()

  // const consumerKey = 'test-consumer-key'
  // const consumerSecret = 'test-consumer-secret'
  const accessToken = 'test-access-token'
  const tokenSecret = 'test-token-secret'
  const setupId = 'test-setup-id'

  const paramsBase: any = {
    buid: 'test-alias',
    scopedUserDataTableName: 'test-scoped-data-table',
    servicesTableName: 'test-services-table',
    environmentIdentifier: 'test-env-id',
    integration: new Integration('test-buid'),
    authId: 'test-authId',
    logger: { log }
  }

  const credentials = {
    accessToken,
    tokenSecret,
    setupId,
    connectParams: { connect: 'connect-param' },
    expiresIn: 1234,
    updatedAt: 1111
  }

  const callbackParams = { param: 'value' }

  const setup = ({
    withCallbackParams = false,
    withCredentials = true,
    withFullCredentials = false
  }: {
    withCallbackParams?: boolean
    withCredentials?: boolean
    withFullCredentials?: boolean
  } = {}) => {
    log.mockClear()
    // mocked(getSetupDetails)
    //   .mockResolvedValueOnce({ consumerKey, consumerSecret })
    //   .mockClear()

    const credentialsToUse = { ...credentials } as TOAuth1Payload

    if (withCallbackParams) {
      credentialsToUse.callbackParamsJSON = JSON.stringify(callbackParams)
    }

    if (withFullCredentials) {
      credentialsToUse.consumerKey = 'my-other-consumer-key'
      credentialsToUse.consumerSecret = 'my-other-consumer-secret'
    }

    // mocked(getAuth)
    //   .mockResolvedValueOnce(withCredentials ? credentialsToUse : undefined)
    //   .mockClear()
  }

  it('returns the details from the auth credentials and setup details', async () => {
    setup()

    const auth = await fetchAuthDetails({ ...paramsBase, setupId }, fullIntegrationConfig)

    expect(auth).toMatchSnapshot()
    // expect(getSetupDetails).toMatchSnapshot()
    // expect(getAuth).toMatchSnapshot()
  })

  it('defaults to the HMAC-SHA1 signature type', async () => {
    setup()

    const auth = await fetchAuthDetails({ ...paramsBase, setupId }, requiredIntegrationConfig)

    expect(auth.signatureMethod).toBe(OAuth1SignatureMethod.HmacSha1)
  })

  it('returns any callback params data', async () => {
    setup({ withCallbackParams: true })

    const auth = await fetchAuthDetails(paramsBase, requiredIntegrationConfig)

    expect(auth.callbackParams).toEqual(callbackParams)
  })

  describe("when the setupId used when connecting doesn't match the setupId sent by the user in the request", () => {
    it('throws an InconsistentSetupId error', async () => {
      setup()

      const params = { ...paramsBase, setupId: 'other-setup-id', setupIdFromRequest: true }

      await expect(fetchAuthDetails(params, requiredIntegrationConfig)).rejects.toMatchSnapshot()
    })
  })

  describe("when the setupId used when connecting doesn't match the default setupId", () => {
    it('logs a warning message about inconsistent setupId', async () => {
      setup()

      const params = { ...paramsBase, setupId: 'other-setup-id', setupIdFromRequest: false }

      await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(log).toHaveBeenCalledWith(
        // tslint:disable-next-line:max-line-length
        'Warning: setupId inconsistency - setupId used for authorization setup differs from latest setupId stored in API dashboard'
      )
    })
  })

  describe('when no setupId parameter is present', () => {
    it("doesn't raise an error", async () => {
      setup()

      const auth = await fetchAuthDetails(paramsBase, requiredIntegrationConfig)

      expect(auth).toMatchObject({ accessToken })
    })
  })

  describe('when consumerKey consumerSecret can be found in the auth', () => {
    it('returns the consumerKey and consumerSecret from the authId', async () => {
      setup({ withFullCredentials: true })

      const auth = await fetchAuthDetails(paramsBase, requiredIntegrationConfig)

      expect(auth).toMatchObject({
        consumerKey: 'my-other-consumer-key',
        consumerSecret: 'my-other-consumer-secret'
      })
    })

    it('returns any callback params data', async () => {
      setup({ withFullCredentials: true, withCallbackParams: true })

      const auth = await fetchAuthDetails(paramsBase, requiredIntegrationConfig)

      expect(auth.callbackParams).toEqual(callbackParams)
    })
  })

  describe('when no auth details can be found for the authId', () => {
    it('raises an InvalidAuthId error', async () => {
      setup({ withCredentials: false })

      await expect(fetchAuthDetails(paramsBase, requiredIntegrationConfig)).rejects.toMatchInlineSnapshot(`
[InvalidAuthId: No auth details were found using authId 'test-authId' for API 'test-alias'

Please try again with a valid authId or connect with this authId]
`)
    })
  })
})

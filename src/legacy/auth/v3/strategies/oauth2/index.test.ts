import timekeeper from 'timekeeper'
import { RequestHandler } from 'express'

import { MiddlewareTestHarness } from '../../../../../../tests/utils'
import { authenticate, fetchAuthDetails, CLOCK_DRIFT_MS, GrantType } from '.'
import { TAuthenticateRequest, EAuthType } from '../../types'
// import { getSetupDetails, getAuth, updateAuthV3 } from '../../../../clients/integrations'
// import { mocked } from 'ts-jest/utils'
import Integration from '../../../../functions/integration'
import { authenticate as authCodeAuthenticate } from './auth-code'
import { authenticate as clientCredentialsAuthenticate } from './client-credentials'
import {
  getTokenWithRefreshToken,
  getTokenWithClientCredentials,
  AuthorizationMethod,
  BodyFormat
} from '../../../clients/oauth2'
import { responseToCredentials, getIdTokenJwt } from './common'
// import { expandAuthConfig } from '../../../../api-config/auth-config'

jest.mock('../../../../api-config/auth-config')
jest.mock('../../../../clients/integrations')
jest.mock('../../../../clients/oauth2')
jest.mock('./auth-code')
jest.mock('./client-credentials')
jest.mock('./common')

const requiredIntegrationConfig = {
  authType: EAuthType.OAuth2,
  authorizationURL: 'https://example.com/auth',
  tokenURL: 'https://${authDomain}.example.com/token'
}

describe('authenticate', () => {
  const testResponse = { test: 'response' }

  const mockAuth = (test: MiddlewareTestHarness<TAuthenticateRequest>, middleware: RequestHandler) => {
    // mocked(middleware).mockImplementationOnce((req: TAuthenticateRequest, res: Response, next: NextFunction) => {
    //   expect(req).toBe(test.req)
    //   res.json(testResponse).end()
    //   next()
    // })
  }

  const setup = (grantType: GrantType | undefined) =>
    new MiddlewareTestHarness<TAuthenticateRequest>({
      configureRequest: req => {
        req.integrationConfig = {
          ...requiredIntegrationConfig,
          grantType
        }
      },
      testMiddleware: authenticate
    })

  describe('when the grantType is not specified', () => {
    it('passes through to the auth code authenticate middleware', async () => {
      const test = setup(undefined)
      mockAuth(test, authCodeAuthenticate)

      await test
        .get()
        .expect(testResponse)
        .expect(200)
    })
  })

  describe('when the grantType is AuthCode', () => {
    it('passes through to the auth code authenticate middleware', async () => {
      const test = setup(GrantType.AuthCode)
      mockAuth(test, authCodeAuthenticate)

      await test
        .get()
        .expect(testResponse)
        .expect(200)
    })
  })

  describe('when the grantType is ClientCredentials', () => {
    it('passes through to the client credentials authenticate middleware', async () => {
      const test = setup(GrantType.ClientCredentials)
      mockAuth(test, clientCredentialsAuthenticate)

      await test
        .get()
        .expect(testResponse)
        .expect(200)
    })
  })

  describe('when the grantType is any other value', () => {
    it('throws an InvalidGrantType error', async () => {
      const test = setup('invalid' as GrantType)

      await test.get().expect(422)

      expect(test.err).toMatchSnapshot()
    })
  })
})

describe('fetchAuthDetails', () => {
  const now = new Date(Date.UTC(2019, 0, 1, 0, 0, 30) - CLOCK_DRIFT_MS)
  // const updatedAt = new Date(Date.UTC(2019, 0, 1, 0, 0, 0)).valueOf()

  const expiresInNever = 0
  const expiresInNotExpired = 30
  const expiresInExpired = 29

  const oAuthClientId = 'test-oauth-cient-id'
  const clientSecret = 'test-client-secret'
  const accessToken = 'test-access-token'
  // const refreshToken = 'test-refresh-token'
  // const idToken = 'test-id-token'
  const setupId = 'test-setup-id'

  // const connectParams = { connect: 'connect-param' }
  const callbackParams = { param: 'value' }
  const tokenResponse = { body: { hey: 'there' } }

  const newAccessToken = 'new-access-token'
  // const newRefreshToken = 'new-refresh-token'
  // const newIdToken = 'new-id-token'
  // const newExpiresIn = 42

  const log = jest.fn()

  const paramsBase: any = {
    buid: 'test-alias',
    scopedUserDataTableName: 'test-scoped-data-table',
    servicesTableName: 'test-services-table',
    environmentIdentifier: 'test-env-id',
    integration: new Integration('test-buid'),
    authId: 'test-authId',
    connectParams: {
      authDomain: 'auth22'
    },
    logger: { log }
  }

  const params = {
    ...paramsBase,
    setupId
  }

  const setup = ({}: // expiresIn,
  // withCallbackParams = false,
  // withCredentials = true,
  // withClientCredentials = true,
  // withRefreshToken = true,
  // withTokenResponse = false,
  // idTokenValue = idToken,
  // idTokenJwt
  {
    expiresIn: number
    withCallbackParams?: boolean
    withCredentials?: boolean
    withClientCredentials?: boolean
    withRefreshToken?: boolean
    withTokenResponse?: boolean
    idTokenValue?: string
    idTokenJwt?: any
  }) => {
    // const effectiveRefreshToken = withRefreshToken ? refreshToken : 'non'
    // const credentials = {
    //   setupId,
    //   connectParams,
    //   expiresIn,
    //   updatedAt,
    //   accessToken,
    //   idTokenJwt,
    //   callbackParamsJSON: withCallbackParams ? JSON.stringify(callbackParams) : undefined,
    //   clientId: withClientCredentials ? oAuthClientId : undefined,
    //   clientSecret: withClientCredentials ? clientSecret : undefined,
    //   idToken: idTokenValue,
    //   refreshToken: effectiveRefreshToken,
    //   tokenResponseJSON: withTokenResponse ? JSON.stringify(tokenResponse) : undefined
    // }

    // mocked(getSetupDetails)
    //   .mockResolvedValueOnce({ clientSecret, clientId: oAuthClientId })
    //   .mockClear()
    // mocked(getAuth)
    //   .mockResolvedValueOnce(withCredentials ? credentials : undefined)
    //   .mockClear()
    // mocked(updateAuthV3).mockClear()
    log.mockClear()
    // mocked(getIdTokenJwt).mockClear()
  }

  beforeAll(() => {
    timekeeper.freeze(now)
  })

  afterAll(() => {
    timekeeper.reset()
  })

  describe('when the token never expires', () => {
    it('returns the details from the auth credentials', async () => {
      setup({ expiresIn: expiresInNever })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth).toMatchSnapshot()
      // expect(getSetupDetails).not.toHaveBeenCalled()
      // expect(getAuth).toMatchSnapshot()
    })

    it('decodes any token call response JSON data', async () => {
      setup({ expiresIn: expiresInNever, withTokenResponse: true })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth.tokenResponse).toEqual(tokenResponse)
    })

    it('looks up the clientId and clientSecret if not stored with the credentials', async () => {
      setup({ expiresIn: expiresInNever, withClientCredentials: false })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      // expect(getSetupDetails).toHaveBeenCalled()
      expect(auth).toMatchObject({ clientSecret, clientId: oAuthClientId })
    })
  })

  describe('when the token has NOT expired', () => {
    const storedIdTokenJwt = { realmid: '123456789' }
    const decodedIdTokenJwt = { realmid: '999666222' }

    it('returns the details from the auth credentials', async () => {
      setup({ expiresIn: expiresInNotExpired })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth).toMatchSnapshot()
      // expect(getSetupDetails).not.toHaveBeenCalled()
      // expect(getAuth).toMatchSnapshot()
    })

    describe('when there is a JWT Id Token stored', () => {
      it('returns it', async () => {
        setup({ expiresIn: expiresInNotExpired, idTokenJwt: storedIdTokenJwt })

        const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

        expect(getIdTokenJwt).not.toHaveBeenCalled()
        expect(auth.idTokenJwt).toEqual(storedIdTokenJwt)
      })
    })

    describe('when there is NOT a JWT Id Token stored', () => {
      it('attempts to decode the Id Token and returns the result', async () => {
        // mocked(getIdTokenJwt).mockReturnValueOnce(decodedIdTokenJwt)
        setup({ expiresIn: expiresInNotExpired })

        const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

        expect(auth.idTokenJwt).toEqual(decodedIdTokenJwt)
      })
    })

    it('decodes any token call response JSON data', async () => {
      setup({ expiresIn: expiresInNotExpired, withTokenResponse: true })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth.tokenResponse).toEqual(tokenResponse)
    })

    it('returns any callback params data', async () => {
      setup({ expiresIn: expiresInNotExpired, withCallbackParams: true })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth.callbackParams).toEqual(callbackParams)
    })
  })

  describe('when the token has expired', () => {
    // const expandedIntegrationConfig = {
    //   ...requiredIntegrationConfig,
    //   tokenURL: 'https://auth22.example.com/token'
    // }

    const refreshURL = 'https://example.com/refresh'

    const newTokenResponse = { body: { new: 'data' } }
    const refreshResponse = { accessToken: newAccessToken, decodedResponse: newTokenResponse }

    // const newCredentials = {
    //   accessToken: newAccessToken,
    //   idToken: newIdToken,
    //   refreshToken: newRefreshToken,
    //   expiresIn: newExpiresIn
    // }

    beforeAll(() => {
      // mocked(expandAuthConfig).mockReturnValue(expandedIntegrationConfig)
      // mocked(getTokenWithClientCredentials).mockReturnValue(refreshResponse)
      // mocked(getTokenWithRefreshToken).mockReturnValue(refreshResponse)
      // mocked(responseToCredentials).mockReturnValue(newCredentials)
    })

    beforeEach(() => {
      // mocked(expandAuthConfig).mockClear()
      // mocked(getTokenWithClientCredentials).mockClear()
      // mocked(getTokenWithRefreshToken).mockClear()
      // mocked(responseToCredentials).mockClear()
    })

    it('refreshes the token using the auth credentials and setup details', async () => {
      setup({ expiresIn: expiresInExpired })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      // expect(getSetupDetails).toMatchSnapshot()
      // expect(getAuth).toMatchSnapshot()
      expect(responseToCredentials).toHaveBeenCalledWith(refreshResponse)
      expect(getTokenWithRefreshToken).toMatchSnapshot()
      expect(auth).toMatchSnapshot()
    })

    it('updates the stored auth credentials with the refreshed values', async () => {
      setup({ expiresIn: expiresInExpired })

      await fetchAuthDetails(params, requiredIntegrationConfig)

      // expect(updateAuthV3).toMatchSnapshot()
    })

    it('keeps any callback params that were previously stored', async () => {
      setup({ expiresIn: expiresInExpired, withCallbackParams: true })

      await fetchAuthDetails(params, requiredIntegrationConfig)

      // expect(updateAuthV3).toMatchSnapshot()
    })

    it('uses the refreshURL configuration option when specified', async () => {
      const integrationConfig = {
        ...requiredIntegrationConfig,
        refreshURL
      }

      setup({ expiresIn: expiresInExpired })
      // mocked(expandAuthConfig).mockReturnValue(integrationConfig)

      await fetchAuthDetails(params, integrationConfig)

      expect(getTokenWithRefreshToken).toHaveBeenCalledWith(expect.objectContaining({ tokenURL: refreshURL }))
    })

    it('returns the token call response JSON data, merged with the previous value', async () => {
      setup({ expiresIn: expiresInExpired, withTokenResponse: true })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth.tokenResponse).toEqual({ body: { hey: 'there', new: 'data' } })
    })

    it('returns any callback params data', async () => {
      setup({ expiresIn: expiresInExpired, withCallbackParams: true })

      const auth = await fetchAuthDetails(params, requiredIntegrationConfig)

      expect(auth.callbackParams).toEqual(callbackParams)
    })

    describe('when there is no refresh token', () => {
      describe('when the grant type is Client Credentials', () => {
        it('gets a new token using the client credentials', async () => {
          const integrationConfig = {
            ...requiredIntegrationConfig,
            authorizationMethod: AuthorizationMethod.Header,
            bodyFormat: BodyFormat.Form,
            grantType: GrantType.ClientCredentials,
            config: {
              scope: ['read', 'write']
            }
          }

          // const expandedIntegrationConfig = {
          //   ...integrationConfig,
          //   tokenURL: 'https://auth22.example.com/token'
          // }

          setup({ expiresIn: expiresInExpired, withRefreshToken: false })
          // mocked(expandAuthConfig).mockReturnValueOnce(expandedIntegrationConfig)

          const auth = await fetchAuthDetails(params, integrationConfig)

          expect(getTokenWithClientCredentials).toMatchSnapshot()
          expect(auth).toMatchSnapshot()
        })
      })

      describe('when the grant type is NOT Client Credentials', () => {
        it('raises an AccessTokenExpired error', async () => {
          setup({ expiresIn: expiresInExpired, withRefreshToken: false })

          await expect(fetchAuthDetails(params, requiredIntegrationConfig)).rejects.toMatchSnapshot()
        })
      })
    })
  })

  describe("when the setupId used when connecting doesn't match the setupId sent by the user in the request", () => {
    it('throws an InconsistentSetupId error', async () => {
      setup({ expiresIn: expiresInNever })

      const params = { ...paramsBase, setupId: 'other-setup-id', setupIdFromRequest: true }

      await expect(fetchAuthDetails(params, requiredIntegrationConfig)).rejects.toMatchSnapshot()
    })
  })

  describe("when the setupId used when connecting doesn't match the default setupId", () => {
    it('logs a warning message about inconsistent setupId', async () => {
      setup({ expiresIn: expiresInNever })

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
      setup({ expiresIn: expiresInNever })

      const auth = await fetchAuthDetails(paramsBase, requiredIntegrationConfig)

      expect(auth).toMatchObject({ accessToken })
    })
  })

  describe('when no auth details can be found for the authId', () => {
    it('raises an InvalidAuthId error', async () => {
      setup({ expiresIn: expiresInNever, withCredentials: false })

      await expect(fetchAuthDetails(paramsBase, requiredIntegrationConfig)).rejects.toMatchInlineSnapshot(`
[InvalidAuthId: No auth details were found using authId 'test-authId' for API 'test-alias'

Please try again with a valid authId or connect with this authId]
`)
    })
  })
})

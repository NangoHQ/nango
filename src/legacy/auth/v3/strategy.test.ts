import * as oauth1 from './strategies/oauth1'
import * as oauth2 from './strategies/oauth2'
import { authenticate, fetchAuthDetails } from './strategy'
import { MiddlewareTestHarness } from '../../../../tests/utils'
import { TAuthenticateRequest, EAuthType } from './types'
import { RequestHandler } from 'express'
import { TBackendRequestV4 } from '../../../types'
// mport { MissingAuthId, CredentialsNotConfigured, InvalidAuthId } from './errors'

jest.mock('../../clients/integrations')
jest.mock('./strategies/api-key')
jest.mock('./strategies/basic')
jest.mock('./strategies/oauth1')
jest.mock('./strategies/oauth2')

describe('authenticate', () => {
  const testResponse = { test: 'response' }

  const setup = (authType: EAuthType) =>
    new MiddlewareTestHarness({
      configureRequest: (req: TAuthenticateRequest) => {
        req.integrationConfig = { authType }
      },
      testMiddleware: authenticate
    })

  const mockAuth = (test: MiddlewareTestHarness<TAuthenticateRequest>, middleware: RequestHandler) => {
    // mocked(middleware).mockImplementationOnce((req: TAuthenticateRequest, res: Response, next: NextFunction) => {
    //   expect(req).toBe(test.req)
    //   res.json(testResponse).end()
    //   next()
    // })
  }
  describe('when the authType is OAuth1', () => {
    it('passes through to the oauth1 authenticate middleware', async () => {
      const test = setup(EAuthType.OAuth1)
      mockAuth(test, oauth1.authenticate)

      await test
        .get()
        .expect(testResponse)
        .expect(200)
    })
  })

  describe('when the authType is OAuth2', () => {
    it('passes through to the oauth1 authenticate middleware', async () => {
      const test = setup(EAuthType.OAuth2)
      mockAuth(test, oauth2.authenticate)

      await test
        .get()
        .expect(testResponse)
        .expect(200)
    })
  })

  describe('when the authType is any other type', () => {
    it('raises an OAuthOnlyEndpoint error', async () => {
      const test = setup(EAuthType.NoAuth)

      await test.get().expect(422)

      expect(test.err).toMatchSnapshot()
    })
  })
})

describe('fetchAuthDetails', () => {
  const log = jest.fn()

  const setup = ({ withAuthId = true, withSetupId = true, authType }) =>
    new MiddlewareTestHarness({
      configureRequest: (req: TBackendRequestV4) => {
        req.integration = { buid: 'test-buid', config: jest.fn(() => ({ authType, some: 'config' })) }
        req.buid = 'test-buid'
        if (withAuthId) {
          req.authId = 'test-auth-id'
        }
        if (withSetupId) {
          req.setupId = 'test-setup-id'
        }
        req.logger = { log }
      },
      testMiddleware: fetchAuthDetails
    })

  beforeEach(() => {
    log.mockClear()
  })

  describe('when the authType is NoAuth', () => {
    it('returns no auth details', async () => {
      const test = setup({ authType: EAuthType.NoAuth })

      await test.get().expect(200)

      expect(test.req.auth).toEqual({})
    })
  })

  describe('when the authType is Basic', () => {
    const authDetails = { username: 'test-user', password: 'test-password' }

    beforeEach(() => {
      // mocked(basic.fetchAuthDetails).mockClear()
    })

    describe('when both a setupId and authId were provided', () => {
      const setupParams = { authType: EAuthType.NoAuth }

      it('uses the basic strategy to fetch the auth details', async () => {
        // mocked(basic.fetchAuthDetails).mockResolvedValueOnce(authDetails)
        const test = setup(setupParams)

        await test.get().expect(200)

        expect(test.req.auth).toEqual(authDetails)
      })
    })

    describe('when NO setupId was provided', () => {
      const setupParams = { authType: EAuthType.NoAuth, withSetupId: false }

      it('raises a CredentialsNotConfigured error', async () => {
        const test = setup(setupParams)

        await test.get().expect(422)

        expect(test.err).toMatchInlineSnapshot(`
[CredentialsNotConfigured: Missing credentials for the 'test-alias' API

Please configure the credentials in the dashboard and try again.

See the following link for information: https://docs.bearer.sh/dashboard/apis]
`)
      })
    })

    describe('when NO authId was provided', () => {
      const setupParams = { authType: EAuthType.NoAuth, withAuthId: false }

      it('uses the basic strategy to fetch the auth details', async () => {
        // mocked(basic.fetchAuthDetails).mockResolvedValueOnce(authDetails)
        const test = setup(setupParams)

        await test.get().expect(200)

        expect(test.req.auth).toEqual(authDetails)
      })
    })
  })

  describe('when the authType is ApiKey', () => {
    // const authDetails = { apiKey: 'test-api-key' }

    beforeEach(() => {
      // mocked(apiKey.fetchAuthDetails).mockClear()
    })

    describe('when both a setupId and authId were provided', () => {
      // const setupParams = { authType: EAuthType.NoAuth }

      it('uses the api key strategy to fetch the auth details', async () => {
        // mocked(apiKey.fetchAuthDetails).mockResolvedValueOnce(authDetails)
        // const test = setup(setupParams)
        // await test.get().expect(200)
        // expect(test.req.auth).toEqual(authDetails)
      })
    })

    describe('when NO setupId was provided', () => {
      const setupParams = { authType: EAuthType.NoAuth, withSetupId: false }

      it('raises a CredentialsNotConfigured error', async () => {
        const test = setup(setupParams)

        await test.get().expect(422)

        expect(test.err).toMatchInlineSnapshot(`
[CredentialsNotConfigured: Missing credentials for the 'test-alias' API

Please configure the credentials in the dashboard and try again.

See the following link for information: https://docs.bearer.sh/dashboard/apis]
`)
      })
    })

    describe('when NO authId was provided', () => {
      // const setupParams = { authType: EAuthType.NoAuth, withAuthId: false }

      it('uses the api key strategy to fetch the auth details', async () => {
        //   mocked(apiKey.fetchAuthDetails).mockResolvedValueOnce(authDetails)
        //   const test = setup(setupParams)
        //   await test.get().expect(200)
        //   expect(test.req.auth).toEqual(authDetails)
        // })
      })
    })

    describe('when the authType is OAuth1', () => {
      const authDetails = {
        accessToken: 'test-access-token',
        tokenSecret: 'test-token-secret',
        consumerKey: 'test-consumer-key',
        consumerSecret: 'test-consumer-secret'
      }

      beforeEach(() => {
        // mocked(oauth1.fetchAuthDetails).mockClear()
      })

      describe('when both a setupId and authId were provided', () => {
        const setupParams = { authType: EAuthType.OAuth1 }

        it('uses the oauth1 strategy to fetch the auth details', async () => {
          // mocked(oauth1.fetchAuthDetails).mockResolvedValueOnce(authDetails)
          const test = setup(setupParams)

          await test.get().expect(200)

          expect(test.req.auth).toEqual(authDetails)
        })
      })

      describe('when NO setupId was provided', () => {
        const setupParams = { authType: EAuthType.OAuth1, withSetupId: false }

        it('uses the oauth1 strategy to fetch the auth details', async () => {
          // mocked(oauth1.fetchAuthDetails).mockResolvedValueOnce(authDetails)
          const test = setup(setupParams)

          await test.get().expect(200)

          expect(test.req.auth).toEqual(authDetails)
        })
      })

      describe('when NO authId was provided', () => {
        const setupParams = { authType: EAuthType.OAuth1, withAuthId: false }

        it('raises a MissingAuthId error ', async () => {
          const test = setup(setupParams)

          await test.get().expect(401)

          expect(test.err).toMatchInlineSnapshot(`
[MissingAuthId: You must supply an authId to use the 'test-alias' API

Please try again with a valid authId.

See the following link for information on how to obtain an authId: https://docs.bearer.sh/faq/connect-button]
`)
        })
      })
    })

    describe('when the authType is OAuth2', () => {
      const authDetails = {
        idToken: 'test-id-token',
        accessToken: 'test-access-token'
      }

      beforeEach(() => {
        // mocked(oauth2.fetchAuthDetails).mockClear()
      })

      describe('when both a setupId and authId were provided', () => {
        const setupParams = { authType: EAuthType.OAuth2 }

        it('uses the oauth2 strategy to fetch the auth details', async () => {
          // mocked(oauth2.fetchAuthDetails).mockResolvedValueOnce(authDetails)
          const test = setup(setupParams)

          await test.get().expect(200)

          expect(test.req.auth).toEqual(authDetails)
        })
      })

      describe('when NO setupId was provided', () => {
        const setupParams = { authType: EAuthType.OAuth2, withSetupId: false }

        it('uses the oauth2 strategy to fetch the auth details', async () => {
          // mocked(oauth2.fetchAuthDetails).mockResolvedValueOnce(authDetails)
          const test = setup(setupParams)

          await test.get().expect(200)

          expect(test.req.auth).toEqual(authDetails)
        })
      })

      describe('when NO authId was provided', () => {
        const setupParams = { authType: EAuthType.OAuth2, withAuthId: false }

        it('raises a MissingAuthId error ', async () => {
          const test = setup(setupParams)

          await test.get().expect(401)

          expect(test.err).toMatchInlineSnapshot(`
[MissingAuthId: You must supply an authId to use the 'test-alias' API

Please try again with a valid authId.

See the following link for information on how to obtain an authId: https://docs.bearer.sh/faq/connect-button]
`)
        })
      })
    })

    describe('when the authType is any other value', () => {
      it('raises an InvalidAuthType error', async () => {
        const test = setup({ authType: 'invalid' })

        await test.get().expect(422)

        await expect(test.err).toMatchSnapshot()
      })
    })
  })

  it('returns null credentials when it encounters a MissingAuthId error', async () => {
    // mocked(oauth2.fetchAuthDetails).mockRejectedValueOnce(new MissingAuthId('test-alias'))
    // const test = setup()
    // await test.get().expect(200)
    // expect(test.req.auth).toEqual(oauth2.nullAuthDetails)
    // expect(log.mock.calls.map(v => v[0])).toContain(
    //   'Warning: Using null credentials as no authId parameter was specified'
    // )
  })

  it('returns null credentials when it encounters a CredentialsNotConfigured error', async () => {
    // mocked(oauth2.fetchAuthDetails).mockRejectedValueOnce(new CredentialsNotConfigured('test-alias'))
    // const test = setup()
    // await test.get().expect(200)
    // expect(test.req.auth).toEqual(oauth2.nullAuthDetails)
    // expect(log.mock.calls.map(v => v[0])).toContain('Warning: Using null credentials as no setupId was specified')
  })

  it('returns null credentials when it encounters a InvalidAuthId error', async () => {
    // mocked(oauth2.fetchAuthDetails).mockRejectedValueOnce(new InvalidAuthId('test-alias', 'test-auth-id'))
    // const test = setup()
    // await test.get().expect(200)
    // expect(test.req.auth).toEqual(oauth2.nullAuthDetails)
    // expect(log.mock.calls.map(v => v[0])).toContain(
    //   'Warning: Using null credentials as authId is not authorized for this integration'
    // )
  })

  it('fetches the auth details otherwise', async () => {
    // mocked(oauth2.fetchAuthDetails).mockResolvedValueOnce(authDetails)
    // const test = setup()
    // await test.get().expect(200)
    // expect(test.req.auth).toEqual(authDetails)
  })
})

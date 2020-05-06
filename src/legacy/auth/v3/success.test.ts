import { MiddlewareTestHarness } from '../../../../tests/utils'
import { AuthSuccessRequest, EAuthType, TIntegrationConfig } from './types'
import { authSuccess } from './success'
// import { updateAuthV3 } from '../../clients/integrations'
import timekeeper from 'timekeeper'

jest.mock('../../clients/integrations')

describe('authSuccess', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })
  const setup = ({
    integrationConfig,
    tokenResponse,
    isCallback = false
  }: {
    integrationConfig?: TIntegrationConfig
    tokenResponse?: any
    isCallback?: boolean
  } = {}) =>
    new MiddlewareTestHarness({
      configureRequest: (req: AuthSuccessRequest) => {
        req.buid = 'test-buid'
        req.clientId = 'test-client-id'
        req.connectParams = {
          conParam: 'test-con-param'
        }
        req.setupId = 'test-setup-id'
        req.authId = 'test-auth-id'
        req.tokenResponse = tokenResponse
        req.isCallback = isCallback
        req.credentials = {
          accessToken: 'test-access-token',
          refreshToken: 'test-refresh-token',
          idToken: 'test-id-token',
          expiresIn: 1234
        }
        if (integrationConfig) {
          req.integrationConfig = integrationConfig
        }
      },
      testMiddleware: authSuccess
    })

  it('saves the credentials for the given authId', async () => {
    await timekeeper.withFreeze(new Date(12345678), async () =>
      setup()
        .get()
        .expect(200)
    )

    // expect(updateAuthV3).toMatchSnapshot()
  })

  it('saves the credentials with scopes for the given authId', async () => {
    const integrationConfig: TIntegrationConfig = {
      authType: EAuthType.OAuth2,
      config: {
        scope: ['users']
      }
    }
    await timekeeper.withFreeze(new Date(12345678), async () =>
      setup({ integrationConfig })
        .get()
        .expect(200)
    )

    // expect(updateAuthV3).toMatchSnapshot()
  })

  it('saves the credentials without scopes for the given authId', async () => {
    const integrationConfig: TIntegrationConfig = {
      authType: 'OAUTH2' as any,
      config: {}
    }
    await timekeeper.withFreeze(new Date(12345678), async () =>
      setup({ integrationConfig })
        .get()
        .expect(200)
    )

    // expect(updateAuthV3).toMatchSnapshot()
  })

  it('saves the credentials with token response', async () => {
    await timekeeper.withFreeze(new Date(12345678), async () =>
      setup({ tokenResponse: { body: { hey: 'there' } } })
        .get()
        .expect(200)
    )

    // expect(updateAuthV3).toMatchSnapshot()
  })

  it('renders the `callback` template with the authId and buid', async () => {
    const test = setup()

    await test
      .get()
      .expect('Content-Type', 'text/html; charset=utf-8')
      .expect(200)

    expect(test.view).toMatchSnapshot()
  })

  describe('when the request is a callback request', () => {
    it('saves the query params as JSON along with the credentials', async () => {
      await timekeeper.withFreeze(new Date(12345678), async () =>
        setup({ isCallback: true })
          .get()
          .query({ some_param: 'param value' })
          .expect(200)
      )

      // expect(updateAuthV3).toMatchSnapshot()
    })
  })
})

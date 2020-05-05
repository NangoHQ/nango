import { MiddlewareTestHarness, session } from '../../../../tests/utils'
import { connectConfig, callbackConfig } from './config'
import { TConnectConfigRequest, TCallbackConfigRequest, EAuthType } from './types'
import {
  getConfig
  // getSetupDetails
} from '../clients/integrations'
// import { mocked } from 'ts-jest/utils'
import { expandAuthConfig } from '../../api-config/auth-config'

jest.mock('../../clients/integrations')
jest.mock('../../api-config/auth-config')

describe('connectConfig', () => {
  const setup = (configureRequest: (req: TConnectConfigRequest) => void) =>
    new MiddlewareTestHarness({
      configureRequest,
      setupMiddlewares: [session()],
      testMiddleware: connectConfig
    })

  const setupProduction = (authType = 'OAUTH2') => {
    // const unexpandedIntegrationConfig = {
    //   authType,
    //   prodIntParam: '${some_var}'
    // }

    // const integrationConfig = {
    //   authType,
    //   prodIntParam: 'test-prod-int-value'
    // }

    // mocked(getConfig)
    //   .mockReturnValueOnce(unexpandedIntegrationConfig)
    //   .mockClear()
    // mocked(expandAuthConfig)
    //   .mockReturnValueOnce(integrationConfig)
    //   .mockClear()
    // mocked(getSetupDetails)
    // .mockImplementationOnce(() => ({ prodSetupParam: 'test-prod-setup-value' }))
    // .mockClear()

    return setup(req => {
      req.buid = 'test-buid'
      req.clientId = 'test-client-id'
      req.connectParams = { param: 'test-con-param' }
      req.setupId = 'test-setup-id'
    })
  }

  describe('when authenticating in production', () => {
    it('looks up the integration config and stores it on the request', async () => {
      const test = setupProduction()

      await test.get().expect(200)

      expect(getConfig).toMatchSnapshot()
      expect(test.req.integrationConfig).toEqual({
        authType: 'OAUTH2',
        prodIntParam: 'test-prod-int-value'
      })
    })

    it('expands any variables in the auth config', async () => {
      const test = setupProduction()

      await test.get().expect(200)

      expect(expandAuthConfig).toMatchSnapshot()
    })

    it('looks up the setup details and stores them on the request', async () => {
      const test = setupProduction()

      await test.get().expect(200)

      // expect(getSetupDetails).toMatchSnapshot()
      expect(test.req.setupDetails).toEqual({ prodSetupParam: 'test-prod-setup-value' })
    })

    it('saves the auth config into the session', async () => {
      const test = setupProduction()

      await test.get().expect(200)

      expect(test.req.session.authConfig).toMatchSnapshot()
    })
  })

  it('validates the authType', async () => {
    for (const validType of ['OAUTH1', 'OAUTH2', 'BASIC', 'APIKEY', 'NONE']) {
      await setupProduction(validType)
        .get()
        .expect(200)
    }

    const test = setupProduction('invalid')
    await test.get().expect(422)
    expect(test.err).toMatchSnapshot()
  })
})

describe('callbackConfig', () => {
  const setup = () =>
    new MiddlewareTestHarness<TCallbackConfigRequest>({
      configureRequest: req => {
        req.session!.authConfig = {
          integrationConfig: {
            authType: EAuthType.OAuth1,
            intParam: 'int-param-value'
          },
          setupDetails: {
            setupParam: 'setup-param-value'
          }
        }
      },
      setupMiddlewares: [session()],
      testMiddleware: callbackConfig
    })

  it('sets the auth config on the request, using the values stored in the session', async () => {
    const test = setup()

    await test.get().expect(200)

    expect(test.req.integrationConfig).toEqual({
      authType: EAuthType.OAuth1,
      intParam: 'int-param-value'
    })
    expect(test.req.setupDetails).toEqual({
      setupParam: 'setup-param-value'
    })
  })
})

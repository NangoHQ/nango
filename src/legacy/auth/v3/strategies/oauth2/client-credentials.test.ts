import { MiddlewareTestHarness } from '../../../../../../tests/utils'
import { TAuthenticateRequest, EAuthType } from '../../types'
import { authenticate } from './client-credentials'
// import { getTokenWithClientCredentials } from '../../../../clients/oauth2'
import { responseToCredentials } from './common'

jest.mock('../../../../clients/oauth2')
jest.mock('./common')

describe('authenticate', () => {
  const scope = ['print', 'email']
  const clientId = 'test-client-id'
  const clientSecret = 'test-client-secret'
  // const accessToken = 'test-access-token'
  // const refreshToken = 'test-refresh-token'
  // const idToken = 'test-id-token'
  // const expiresIn = 1234

  const tokenResult = { accessToken: 'response-access-token', decodedResponse: { body: { hey: 'there' } } }
  // const credentials = { accessToken, expiresIn, idToken, refreshToken }

  const setup = () =>
    new MiddlewareTestHarness<TAuthenticateRequest>({
      configureRequest: req => {
        req.integrationConfig = {
          authType: EAuthType.OAuth2,
          config: { scope },
          tokenURL: 'https://example.com/token'
        }
        req.setupDetails = { clientId, clientSecret }
      },
      testMiddleware: authenticate
    })

  beforeAll(() => {
    // mocked(getTokenWithClientCredentials).mockResolvedValue(tokenResult)
    // mocked(responseToCredentials).mockReturnValue(credentials)
  })

  beforeEach(() => {
    // mocked(responseToCredentials).mockClear()
  })

  it('fetches the tokens using the setup details', async () => {
    const test = setup()

    await test.get().expect(200)

    expect(responseToCredentials).toHaveBeenCalledWith(tokenResult)
    expect(test.req.credentials).toMatchSnapshot()
  })

  it('stores the token call response data on the request', async () => {
    const test = setup()

    await test
      .get()
      .query('code=test-code')
      .expect(200)

    expect(test.req.tokenResponse).toEqual(tokenResult.decodedResponse)
  })
})

import timekeeper from 'timekeeper'

import { MiddlewareTestHarness } from '../../../tests/utils'
import { authDetailsResponse, FetchAuthDetailsRequest } from './auth-details'
import { EAuthType } from './v3/types'
import { OAuthOnlyEndpoint } from './v3/errors'

describe('authDetailsResponse', () => {
  const commonDetails = {
    callbackParams: { callback: 'param' },
    expiresIn: 1234,
    tokenResponse: { token: 'response' },
    updatedAt: 1000
  }

  const oauth1AuthDetails = {
    ...commonDetails,
    accessToken: 'test-access-token',
    consumerKey: 'test-consumer-key',
    consumerSecret: 'test-consumer-secret',
    signatureMethod: 'PLAINTEXT',
    tokenSecret: 'test-token-secret'
  }

  const oauth2AuthDetails = {
    ...commonDetails,
    accessToken: 'test-access-token',
    clientId: 'test-client-id',
    clientSecret: 'test-client-secret',
    idToken: 'test-id-token',
    idTokenJwt: { jwt: 'token' },
    refreshToken: 'test-refresh-token'
  }

  const setup = ({ authType = EAuthType.OAuth2, withAuth = true } = {}) =>
    new MiddlewareTestHarness<FetchAuthDetailsRequest>({
      configureRequest: req => {
        req.integration = { config: () => Promise.resolve({ authType }) } as any
        req.authId = 'test-auth-id'
        req.buid = 'test-alias'

        if (withAuth) {
          req.auth = (authType === EAuthType.OAuth1 ? oauth1AuthDetails : oauth2AuthDetails) as any
        }
      },
      testMiddleware: authDetailsResponse
    })

  it('returns formatted data for OAuth1 APIs', async () => {
    const test = setup({ authType: EAuthType.OAuth1 })

    const res = await test.get().expect(200)

    expect(res.body).toMatchSnapshot()
  })

  it('returns formatted data for OAuth1 APIs', async () => {
    const test = setup({ authType: EAuthType.OAuth2 })

    const res = await test.get().expect(200)

    expect(res.body).toMatchSnapshot()
  })

  it('returns true for the access token active value when the "expires at" value is in the future', async () => {
    await timekeeper.withFreeze(1234, async () => {
      const test = setup()

      const res = await test.get().expect(200)

      expect(res.body.accessToken.active).toBeTruthy()
    })
  })

  it('raises an OAuthOnlyEndpoint error if the API auth type is not oauth1/2', async () => {
    const test = setup({ authType: EAuthType.NoAuth })

    await test.get().expect(422)

    expect(test.err).toBeInstanceOf(OAuthOnlyEndpoint)
  })
})

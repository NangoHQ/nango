import nock from 'nock'
import timekeeper from 'timekeeper'

import {
  getTokenWithRefreshToken,
  getTokenWithClientCredentials,
  TokenResult,
  getCodeRedirectURL,
  BodyFormat,
  AuthorizationMethod,
  getTokenWithCode
} from './oauth2'
// import { mocked } from 'ts-jest/utils'
// import { inspectAccessToken } from './openid-connect'

jest.mock('./openid-connect')

const clientId = 'test-oauth-client-id'
const clientSecret = 'test-client-secret'
const accessToken = 'test-access-token'
const refreshToken = 'test-refresh-token'
const idToken = 'test-id-token'
const expiresIn = 42
const state = 'test-state'
const scope = ['read', 'write']

const authorizationURL = 'https://example.com/auth'
const callbackURL = 'https://bearer.example.com/callback'
const tokenURL = 'https://example.com/token'

const authorizationParams = { auth: 'param' }

const encodedOAuthClientDetails = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

const minimalResponse = {
  access_token: accessToken
}

const response = {
  ...minimalResponse,
  refresh_token: refreshToken,
  id_token: idToken,
  expires_in: expiresIn
}

const tokenResult = {
  accessToken,
  expiresIn,
  idToken,
  refreshToken,
  decodedResponse: {
    body: {
      access_token: accessToken,
      expires_in: 42,
      id_token: idToken,
      refresh_token: refreshToken
    },
    headers: {
      'content-type': 'application/json',
      useful_header: 'abc'
    }
  }
}

const responseHeaders = { useful_header: 'abc' }

const commonHeaders = {
  Accept: 'application/json',
  'User-Agent': 'Pizzly'
}

// mocked(inspectAccessToken).mockResolvedValue(undefined)

beforeEach(() => {
  // mocked(inspectAccessToken).mockClear()
})

const sharedTokenTests = (mockRequest: () => nock.Interceptor, triggerRequest: () => Promise<TokenResult>) => {
  describe('when the response includes a `expires_in_sec` value (eg. Zoho API)', () => {
    it('returns it as the `expiresIn` value', async () => {
      mockRequest().reply(200, { ...response, expires_in_sec: 123 })

      const result = await triggerRequest()

      expect(result.expiresIn).toBe(123)
    })
  })

  describe('when there is no `expires_in` value in the token response', () => {
    beforeEach(() => {
      mockRequest().reply(200, minimalResponse)
    })

    it('inspects the access token and uses `exp` and `iat` from the metadata to calculate `expiresIn`', async () => {
      // mocked(inspectAccessToken).mockResolvedValueOnce({ exp: 1234, iat: 1192 })

      const result = await triggerRequest()

      expect(result.expiresIn).toBe(42)
    })

    it('returns no `expiresIn` when no token metadata is available', async () => {
      // mocked(inspectAccessToken).mockResolvedValueOnce(undefined)

      const result = await triggerRequest()

      expect(result.expiresIn).toBeUndefined()
    })

    it('returns no `expiresIn` when the token metadata has no `exp` value', async () => {
      // mocked(inspectAccessToken).mockResolvedValueOnce({ iat: 1192 })

      const result = await triggerRequest()

      expect(result.expiresIn).toBeUndefined()
    })

    it('uses the current time for the calculation when the token metadata has no `iat` value', async () => {
      // mocked(inspectAccessToken).mockResolvedValueOnce({ exp: 1234 })

      await timekeeper.withFreeze(1000000, async () => {
        const result = await triggerRequest()

        expect(result.expiresIn).toBe(234)
      })
    })
  })

  describe('when the request returns an error response', () => {
    describe('when the response is text', () => {
      it('raises an AuthenticationFailed error with the response', async () => {
        mockRequest().reply(400, 'oops', { 'Content-Type': 'text/html' })

        await expect(triggerRequest()).rejects.toMatchSnapshot()
      })
    })

    describe('when the response is JSON', () => {
      it('raises an AuthenticationFailed error with the response', async () => {
        mockRequest().reply(400, { error: 'oops', error_description: 'something bad' })

        await expect(triggerRequest()).rejects.toMatchSnapshot()
      })
    })
  })

  describe('when an unknown error is raised while making the refresh request', () => {
    it('propagates the error', async () => {
      mockRequest().replyWithError(new Error('unknown error'))

      await expect(triggerRequest()).rejects.toMatchSnapshot()
    })
  })

  describe('when the refresh request returns a success response but there is no access token', () => {
    describe('when the response is text', () => {
      it('raises an AuthenticationFailed error with the response', async () => {
        mockRequest().reply(200, 'no token', { 'Content-Type': 'text/html' })

        await expect(triggerRequest()).rejects.toMatchSnapshot()
      })
    })

    describe('when the response is JSON', () => {
      it('raises an AuthenticationFailed error with the response', async () => {
        mockRequest().reply(200, { no: 'token' })

        await expect(triggerRequest()).rejects.toMatchSnapshot()
      })
    })
  })
}

describe('getCodeRedirectURL', () => {
  it('returns the authorization URL with appropriate parameters', () => {
    const url = getCodeRedirectURL({
      authorizationParams,
      authorizationURL,
      callbackURL,
      clientId,
      scope,
      state
    })

    expect(url).toMatchSnapshot()
  })
})

describe('getTokenWithCode', () => {
  const code = 'test-code'
  const tokenParams = { token: 'param' }
  const params = { callbackURL, clientId, clientSecret, code, tokenParams, tokenURL, scope }

  const mockRequest = () =>
    nock('https://example.com')
      .post(
        '/token',
        // tslint:disable-next-line:max-line-length
        `grant_type=authorization_code&token=param&code=${code}&redirect_uri=https%3A%2F%2Fbearer.example.com%2Fcallback&client_id=${clientId}&client_secret=${clientSecret}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
      .once()

  it('fetches the token and returns the response', async () => {
    mockRequest().reply(200, response, responseHeaders)

    const result = await getTokenWithCode(params)

    expect(result).toMatchObject(tokenResult)
  })

  it('sends the client id and secret in the headers when the authorizationMethod is Header', async () => {
    const nockScope = nock('https://example.com')
      .post(
        '/token',
        // tslint:disable-next-line:max-line-length
        `grant_type=authorization_code&token=param&code=${code}&redirect_uri=https%3A%2F%2Fbearer.example.com%2Fcallback`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded',
            Authorization: `Basic ${encodedOAuthClientDetails}`
          }
        }
      )
      .once()
      .reply(200, response)

    await getTokenWithCode({ ...params, authorizationMethod: AuthorizationMethod.Header })

    // Request matching our mock with `Authorization` header was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  it('encodes the body as JSON when the bodyFormat is JSON', async () => {
    const nockScope = nock('https://example.com')
      .post(
        '/token',
        // tslint:disable-next-line:max-line-length
        `{"grant_type":"authorization_code","token":"param","code":"${code}","redirect_uri":"${callbackURL}","client_id":"${clientId}","client_secret":"${clientSecret}"}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
      .once()
      .reply(200, response)

    await getTokenWithCode({ ...params, bodyFormat: BodyFormat.JSON })

    // Request matching our mock with JSON body was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  sharedTokenTests(mockRequest, () => getTokenWithCode(params))
})

describe('getTokenWithRefreshToken', () => {
  const oldRefreshToken = 'old-refresh-token'
  const oldIdToken = 'old-id-token'
  const params = { clientId, clientSecret, tokenURL, idToken: oldIdToken, refreshToken: oldRefreshToken }

  const mockRequest = () =>
    nock('https://example.com')
      .post(
        '/token',
        `grant_type=refresh_token&refresh_token=${oldRefreshToken}&client_id=${clientId}&client_secret=${clientSecret}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
      .once()

  it('refeshes the token and returns the response', async () => {
    mockRequest().reply(200, response, responseHeaders)

    const result = await getTokenWithRefreshToken(params)

    expect(result).toMatchObject(tokenResult)
  })

  describe('when no refreshToken or idToken were returned', () => {
    it('returns the old refreshToken and idToken', async () => {
      mockRequest().reply(200, minimalResponse)

      const result = await getTokenWithRefreshToken(params)

      expect(result).toMatchObject({ idToken: oldIdToken, refreshToken: oldRefreshToken })
    })
  })

  it('sends the client id and secret in the headers when the authorizationMethod is Header', async () => {
    const nockScope = nock('https://example.com')
      .post('/token', `grant_type=refresh_token&refresh_token=${oldRefreshToken}`, {
        reqheaders: {
          ...commonHeaders,
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${encodedOAuthClientDetails}`
        }
      })
      .once()
      .reply(200, response)

    await getTokenWithRefreshToken({ ...params, authorizationMethod: AuthorizationMethod.Header })

    // Request matching our mock with `Authorization` header was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  it('encodes the body as JSON when the bodyFormat is JSON', async () => {
    const nockScope = nock('https://example.com')
      .post(
        '/token',
        // tslint:disable-next-line:max-line-length
        `{"grant_type":"refresh_token","refresh_token":"${oldRefreshToken}","client_id":"${clientId}","client_secret":"${clientSecret}"}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
      .once()
      .reply(200, response)

    await getTokenWithRefreshToken({ ...params, bodyFormat: BodyFormat.JSON })

    // Request matching our mock with JSON body was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  sharedTokenTests(mockRequest, () => getTokenWithRefreshToken(params))
})

describe('getTokenWithClientCredentials', () => {
  const params = { clientId, clientSecret, tokenURL, scope }

  const mockRequest = () =>
    nock('https://example.com')
      .post(
        '/token',
        `grant_type=client_credentials&scope=read%20write&client_id=${clientId}&client_secret=${clientSecret}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      )
      .once()

  it('fetches the token and returns the response', async () => {
    mockRequest().reply(200, response, responseHeaders)

    const result = await getTokenWithClientCredentials(params)

    expect(result).toMatchObject(tokenResult)
  })

  it('sends the client id and secret in the headers when the authorizationMethod is Header', async () => {
    const nockScope = nock('https://example.com')
      .post('/token', 'grant_type=client_credentials&scope=read%20write', {
        reqheaders: {
          ...commonHeaders,
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${encodedOAuthClientDetails}`
        }
      })
      .once()
      .reply(200, response)

    await getTokenWithClientCredentials({ ...params, authorizationMethod: AuthorizationMethod.Header })

    // Request matching our mock with `Authorization` header was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  it('encodes the body as JSON when the bodyFormat is JSON', async () => {
    const nockScope = nock('https://example.com')
      .post(
        '/token',
        // tslint:disable-next-line:max-line-length
        `{"grant_type":"client_credentials","scope":"read write","client_id":"${clientId}","client_secret":"${clientSecret}"}`,
        {
          reqheaders: {
            ...commonHeaders,
            'Content-Type': 'application/json'
          }
        }
      )
      .once()
      .reply(200, response)

    await getTokenWithClientCredentials({ ...params, bodyFormat: BodyFormat.JSON })

    // Request matching our mock with JSON body was sent
    expect(nockScope.isDone).toBeTruthy()
  })

  sharedTokenTests(mockRequest, () => getTokenWithClientCredentials(params))
})

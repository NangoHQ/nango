import nock = require('nock')

import { inspectAccessToken } from './openid-connect'

describe('inspectAccessToken', () => {
  const accessToken = 'test-access-token'
  const clientId = 'test-client-id'
  const clientSecret = 'test-client-secret'
  const tokenURL = 'http://example.com/oauth/token'

  const basicAuthCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const config = {
    introspection_endpoint: 'http://example.com/introspection'
  }

  const tokenMetadata = {
    iat: 1234,
    exp: 9999
  }

  beforeAll(() => {
    nock('http://example.com')
      .get('/.well-known/openid-configuration')
      .reply(200, config)

    nock('http://example.com')
      .post('/introspection', `token=${accessToken}&token_type_hint=access_token`, {
        reqheaders: {
          Authorization: `Basic ${basicAuthCredentials}`
        }
      })
      .reply(200, tokenMetadata)
  })

  it('looks up the introspection URL and fetches the token metadata', async () => {
    const result = await inspectAccessToken({ accessToken, clientId, clientSecret, tokenURL })

    expect(result).toEqual(tokenMetadata)
  })

  it('returns undefined if there is an error looking up the OpenID configuration', async () => {
    nock('http://example.com')
      .get('/.well-known/openid-configuration')
      .once()
      .reply(404)

    const result = await inspectAccessToken({ accessToken, clientId, clientSecret, tokenURL })

    expect(result).toBeUndefined()
  })

  it('returns undefined if there is no introspection endpoint in the OpenID configuration', async () => {
    nock('http://example.com')
      .get('/.well-known/openid-configuration')
      .once()
      .reply(200, {})

    const result = await inspectAccessToken({ accessToken, clientId, clientSecret, tokenURL })

    expect(result).toBeUndefined()
  })

  it('returns undefined if there is an error inspecting the token', async () => {
    nock('http://example.com')
      .post('/introspection', `token=${accessToken}&token_type_hint=access_token`, {
        reqheaders: {
          Authorization: `Basic ${basicAuthCredentials}`
        }
      })
      .once()
      .reply(500)

    const result = await inspectAccessToken({ accessToken, clientId, clientSecret, tokenURL })

    expect(result).toBeUndefined()
  })
})

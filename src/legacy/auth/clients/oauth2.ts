import simpleOauth2, { Token } from 'simple-oauth2'
import Wreck from 'wreck'
import http from 'http'
import { URL } from 'url'

import { AuthenticationFailed } from '../v3/errors'
import Boom from 'boom'
import { OAuthTokenResponse } from '../v3/types'
// import { inspectAccessToken } from './openid-connect'

const headers = { 'User-Agent': 'Pizzly' }

const createClientForRedirect = ({ authorizationURL, clientId }: RedirectClientParams) => {
  const url = new URL(authorizationURL)

  return simpleOauth2.create({
    client: { id: clientId, secret: '' },
    auth: {
      tokenHost: url.origin,
      authorizeHost: url.origin,
      authorizePath: url.pathname
    },
    http: { headers }
  })
}

const createClientForToken = ({
  authorizationMethod,
  bodyFormat,
  clientId,
  clientSecret,
  tokenURL
}: TokenClientParams) => {
  const url = new URL(tokenURL)

  return simpleOauth2.create({
    client: { id: clientId, secret: clientSecret },
    auth: { tokenHost: url.origin, tokenPath: url.pathname },
    http: { headers, events: true },
    options: {
      authorizationMethod: authorizationMethod || AuthorizationMethod.Body,
      bodyFormat: bodyFormat || BodyFormat.Form
    }
  })
}

const translateError = (e: any) => {
  if (e.data && e.data.isResponseError) {
    const {
      payload,
      res: { statusCode }
    } = e.data

    const response = Buffer.isBuffer(payload) ? payload.toString() : payload
    return new AuthenticationFailed({ statusCode, response })
  }

  if (e.isBoom) {
    return new AuthenticationFailed({ message: e.message })
  }

  return e
}

const translateNoTokenResponse = (response: any) => {
  // The simple-oauth2 library blindly does an Object.assign with the response.
  // When the response was a string, it results in an object with string index
  // keys and numeric character code values!
  const hasIntegerKeys = Object.keys(response)
    .map(Number)
    .every(Number.isInteger)
  const values = Object.values(response)

  if (hasIntegerKeys && values.every(Number.isInteger)) {
    return String.fromCharCode(...(values as any))
  }

  return response
}

const getExpiresIn = async (params: TokenClientParams, token: simpleOauth2.Token) => {
  // const { clientId, clientSecret, tokenURL } = params

  // Zoho doesn't follow the spec and returns `expires_in` in ms.
  // They provide the usual value in `expires_in_sec` instead
  const expiresIn = token.expires_in_sec || token.expires_in

  // if (!expiresIn) {
  //   const metadata = await inspectAccessToken({ clientId, clientSecret, tokenURL, accessToken: token.access_token })

  //   if (metadata && metadata.exp) {
  //     const issuedAt = metadata.iat || Math.trunc(Date.now() / 1000)
  //     return metadata.exp - issuedAt
  //   }
  // }

  return expiresIn
}

const wrapTokenOperation = async (
  client: simpleOauth2.OAuthClient,
  params: TokenClientParams,
  body: () => Promise<Token>
) => {
  // The simple-oauth2 library has no supported way of accessing the
  // request/response so we must reach into it's guts and hook the HTTP client
  // that it uses!
  const wreck = (client.authorizationCode as any).client.client as typeof Wreck

  let headers
  wreck.events!.once('response', (_err: Boom | undefined, { res }: WreckResponseDetails) => {
    if (res) {
      headers = res.headers
    }
  })

  let token
  try {
    token = await body()
  } catch (e) {
    throw translateError(e)
  }

  if (!token.access_token) {
    throw new AuthenticationFailed({
      message: 'No access token returned',
      response: translateNoTokenResponse(token)
    })
  }

  return {
    accessToken: token.access_token,
    expiresIn: await getExpiresIn(params, token),
    idToken: token.id_token,
    refreshToken: token.refresh_token,
    decodedResponse: {
      headers,
      body: token
    }
  } as TokenResult
}

const buildScope = (scopes: string[]) => scopes.join(' ')

export const getCodeRedirectURL = (params: RedirectParams) => {
  const { authorizationParams, callbackURL, scope, state } = params
  const client = createClientForRedirect(params)

  return client.authorizationCode.authorizeURL({
    ...authorizationParams,
    state,
    redirect_uri: callbackURL,
    scope: buildScope(scope)
  })
}

export const getTokenWithCode = async (params: CodeParams) => {
  const { callbackURL, code, tokenParams } = params
  const client = createClientForToken(params)

  return wrapTokenOperation(client, params, () =>
    client.authorizationCode.getToken({
      ...tokenParams,
      code,
      redirect_uri: callbackURL
    })
  )
}

export const getTokenWithRefreshToken = async (params: RefreshParams) => {
  const { idToken, refreshToken } = params
  const client = createClientForToken(params)
  const clientToken = client.accessToken.create({ refresh_token: refreshToken })

  const response = await wrapTokenOperation(client, params, async () => {
    return (await clientToken.refresh()).token
  })

  response.refreshToken = response.refreshToken || refreshToken
  response.idToken = response.idToken || idToken

  return response
}

export const getTokenWithClientCredentials = async (params: GetTokenClientCredsParams) => {
  const { scope } = params
  const client = createClientForToken(params)

  return wrapTokenOperation(client, params, async () => {
    return client.clientCredentials.getToken({ scope: buildScope(scope) })
  })
}

interface RedirectClientParams {
  authorizationURL: string
  clientId: string
}

interface RedirectParams extends RedirectClientParams {
  authorizationParams: any
  callbackURL: string
  scope: string[]
  state: string
}

export enum AuthorizationMethod {
  Body = 'body',
  Header = 'header'
}

export enum BodyFormat {
  Form = 'form',
  JSON = 'json'
}

interface TokenClientParams {
  authorizationMethod?: AuthorizationMethod
  bodyFormat?: BodyFormat
  clientId: string
  clientSecret: string
  tokenURL: string
}

interface CodeParams extends TokenClientParams {
  callbackURL: string
  code: any // string
  tokenParams: any
}

interface RefreshParams extends TokenClientParams {
  idToken?: string
  refreshToken: string
}

interface GetTokenClientCredsParams extends TokenClientParams {
  scope: string[]
}

export interface TokenResult {
  accessToken: string
  expiresIn?: number
  idToken?: string
  refreshToken?: string
  decodedResponse: OAuthTokenResponse
}

interface WreckResponseDetails {
  req: http.ClientRequest
  res?: http.IncomingMessage
  start: number
  url: URL
}

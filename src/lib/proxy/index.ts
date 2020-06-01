import https from 'https'
import express from 'express'
import { integrations, authentications } from '../database'
import { interpolate } from './interpolation'
import { accessTokenHasExpired, refreshAuthentication } from '../oauth'
import { PizzlyError } from '../error-handling'
import { Types } from '../../types'
import { IncomingMessage } from 'http'

/**
 * Handle the request sent to Pizzly from the developer's application
 * and forward it to the third party API.
 *
 * @param req
 * @param res
 * @param next
 */

export const incomingRequestHandler = async (req, res, next) => {
  // General inputs validation
  const authId = req.get('Pizzly-Auth-Id') || ''
  const integrationName = req.params.integration

  if (!authId) {
    return next(new PizzlyError('missing_auth_id'))
  }

  // Retrieve integration & authentication details
  const integration = await integrations.get(integrationName)
  if (!integration) {
    return next(new Error('unknown_integration'))
  }

  let authentication: Types.Authentication | undefined =
    (authId && (await authentications.get(integrationName, authId))) || undefined
  if (!authentication) {
    return next(new PizzlyError('unknown_authentication'))
  }

  // Handle the token freshness (if it has expired)
  if (await accessTokenHasExpired(authentication)) {
    authentication = await refreshAuthentication(integration, authentication)
    if (!authentication) {
      return next(new Error('token_refresh_failed')) // TODO: improve error verbosity
    }
  }

  // TODO: allow oauth1 template interpolation

  // Prepare the request
  const { headers: integrationHeaders, params: integrationParams } = integration.request
  const headers = { ...integrationHeaders, ...headersToForward(req.rawHeaders) }

  const endpoint = req.originalUrl.substring(('/proxy/' + integrationName).length + 1)
  const url = new URL(endpoint, integration.request.baseURL)

  // Remove pizzly related params: ex
  url.searchParams.forEach((value, key) => {
    if (key.startsWith('pizzly_')) {
      url.searchParams.delete(key)
    }
  })

  // set default params
  if (integrationParams) {
    for (let param in integrationParams) {
      url.searchParams.append(param, integrationParams[param])
    }
  }

  const rawOptions = { url, headers, method: req.method }

  try {
    // Replace request options with provided authentication or data
    // i.e. replace ${auth.accessToken} from the integration template
    // with the authentication access token retrieved from the database.
    const externalRequestOptions = replaceEmbeddedExpressions(rawOptions, authentication)

    // Make the request
    const externalRequest = https.request(externalRequestOptions.url, externalRequestOptions, externalResponse => {
      externalResponseHandler(externalResponse, req, res, next)
    })
    req.pipe(externalRequest)

    // Handle error
    externalRequest.on('error', error => {
      throw error
    })
  } catch (err) {
    next(err)
  }
}
/**
 * Handle the response from the third party API
 * and send it back to the developer's application.
 *
 * @param externalResponse
 * @param req
 * @param res
 * @param next
 */

const externalResponseHandler = (
  externalResponse: IncomingMessage,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  // Set headers

  res.writeHead(externalResponse.statusCode!, externalResponse.headers)
  externalResponse.pipe(res)
}

/**
 * Helper to determine which headers to forward.
 *
 * The proxy feature forwards all headers starting with "Pizzly-Proxy-"
 * to the third-party API.
 *
 * @params headers (string[]) - The original request headers
 * @return (object) - The headers to forward
 */

const headersToForward = (headers: string[]): { [key: string]: string } => {
  const forwardedHeaders = {}
  const prefix = 'Pizzly-Proxy-'
  const prefixLength = prefix.length

  for (let i = 0, n = headers.length; i < n; i += 2) {
    const headerKey = headers[i]

    if (headerKey.indexOf(prefix) === 0) {
      forwardedHeaders[headerKey.slice(prefixLength)] = headers[i + 1] || ''
    }
  }

  return forwardedHeaders
}

/**
 * Helper to replace embedded expressions (such as ${auth.accessToken})
 * with data saved on the database or data provided by the developer.
 */

const replaceEmbeddedExpressions = (
  options: { url: URL; method: string; headers: { [key: string]: string } },
  authentication: Types.Authentication
) => {
  const oauthPayload = authentication.payload

  const variables = {
    auth: {
      accessToken: oauthPayload.accessToken
    },
    headers: options.headers
  }

  return { ...interpolate(options, '', variables), url: options.url }
}

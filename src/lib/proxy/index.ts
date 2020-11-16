import https from 'https'
import { URL } from 'url'
import express from 'express'
import { integrations, authentications } from '../database'
import { interpolate } from './interpolation'
import { accessTokenHasExpired, refreshAuthentication } from '../oauth'
import { PizzlyError } from '../error-handling'
import { Types } from '../../types'
import { IncomingMessage } from 'http'
import { isOAuth1 } from '../database/integrations'
import { getConfiguration } from '../database/configurations'
import { getOAuth1Credentials } from '../../legacy/api-config/request-config'

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

  try {
    // Handle the token freshness (if it has expired)
    if (await accessTokenHasExpired(authentication)) {
      authentication = await refreshAuthentication(integration, authentication)
    }

    if (!authentication) {
      return next(new PizzlyError('token_refresh_failed')) // TODO: improve error verbosity
    }

    // Replace request options with provided authentication or data
    // i.e. replace ${auth.accessToken} from the integration template
    // with the authentication access token retrieved from the database.
    const forwardedHeaders = headersToForward(req.rawHeaders)
    const { url, headers } = await buildRequest({
      authentication,
      integration,
      method: req.method,
      forwardedHeaders: forwardedHeaders,
      path: req.originalUrl.substring(('/proxy/' + integrationName).length + 1)
    })

    // Remove pizzly related params: ex
    url.searchParams.forEach((value, key) => {
      if (key.startsWith('pizzly_')) {
        url.searchParams.delete(key)
      }
    })

    // Perform external request
    const externalRequest = https.request(url, { headers, method: req.method }, externalResponse => {
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
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction
) => {
  // Set headers

  res.writeHead(externalResponse.statusCode!, externalResponse.headers)
  externalResponse.pipe(res)
}

/**
 * Helper to determine which headers to forward.
 *
 * The proxy feature forwards all headers starting with "Pizzly-Proxy-" (case insensitive)
 * to the third-party API.
 *
 * @params headers (string[]) - The original request headers
 * @return (object) - The headers to forward
 */

const HEADER_PROXY = 'pizzly-proxy-'
const headersToForward = (headers: string[]): { [key: string]: string } => {
  const forwardedHeaders = {}

  for (let i = 0, n = headers.length; i < n; i += 2) {
    const headerKey = headers[i].toLowerCase()

    if (headerKey.startsWith(HEADER_PROXY)) {
      forwardedHeaders[headerKey.slice(HEADER_PROXY.length)] = headers[i + 1] || ''
    }
  }

  return forwardedHeaders
}

async function buildRequest({
  integration,
  path,
  authentication,
  forwardedHeaders,
  method
}: {
  integration: Types.Integration
  path: string
  authentication: Types.Authentication
  forwardedHeaders: Record<string, any>
  method: string
}) {
  const { request: requestConfig } = integration
  try {
    // First interpolation phase with utility headers (prefixed with Pizzly)
    let auth = { ...authentication.payload }

    // edge case: we need consumerKey an consumerSecret availability within templates
    if (isOAuth1(integration)) {
      //
      const config = await getConfiguration(integration.id, authentication.setup_id)
      if (config) {
        const configDetails = config.credentials as Types.OAuth1Credentials
        const callbackParams = auth.callbackParamsJSON ? JSON.parse(auth.callbackParamsJSON) : undefined
        const oauth1 = getOAuth1Credentials({
          baseURL: requestConfig.baseURL,
          method,
          path,
          auth: {
            callbackParams,
            ...integration.auth,
            ...(auth as Types.OAuth1Payload),
            ...configDetails
          }
        })
        auth = {
          oauth1,
          ...auth,
          consumerKey: configDetails.consumerKey
        } as any
      }
    }
    const interpolatedHeaders = interpolate({ ...(requestConfig.headers || {}), ...forwardedHeaders }, '', {
      auth
    })

    // redefine interpolate with interpolated headers
    const localInterpolate = (template: any) => interpolate(template, '', { auth: auth, headers: interpolatedHeaders })

    // Second interpolation with interpolated headers
    const url = new URL(localInterpolate(path), localInterpolate(requestConfig.baseURL))
    const interpolatedParams = localInterpolate(requestConfig.params || {})

    for (let param in interpolatedParams) {
      url.searchParams.append(param, interpolatedParams[param])
    }

    return {
      url,
      headers: interpolatedHeaders
    }
  } catch (e) {
    // handle incorrect interpolation
    throw e
  }
}

import https from 'https'
import * as integrations from '../integrations'
import * as authentications from '../authentications'
import { interpolate } from './interpolation'
import express from 'express'
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
    return next(new Error('missing_auth_id'))
  }

  // Retrieve integration & authentication details
  const integration = await integrations.get(integrationName)
  const authentication = (authId && (await authentications.get(integrationName, authId))) || undefined

  // Validate each
  if (!integration) {
    return next(new Error('unknown_integration'))
  }

  if (!authentication) {
    return next(new Error('unknown_authentication'))
  }

  // Prepare the request
  const forwaredHeaders = headersToForward(req.rawHeaders)
  const integrationHeaders = integration.request.headers
  const integrationParams = integration.request.params

  const endpoint = req.originalUrl.substring(('/proxy/' + integrationName).length + 1)
  const url = new URL(endpoint, integration.request.baseURL)

  if (integrationParams) {
    for (let param in integrationParams) {
      url.searchParams.append(param, integrationParams[param])
    }
  }

  const rawOptions = {
    url,
    method: req.method,
    headers: { ...integrationHeaders, ...forwaredHeaders }
  }

  try {
    // Replace request options with provided authentication or data
    //
    // i.e. replace ${auth.accessToken} from the integration template
    // with the authentication access token retrieved from the database.
    const externalRequestOptions = replaceEmbeddedExpressions(rawOptions, authentication)

    // Make the request
    const externalRequest = https.request(externalRequestOptions.url, externalRequestOptions, externalResponse => {
      externalResponseHandler(externalResponse, req, res, next)
    })

    // Handle error
    externalRequest.on('error', error => {
      throw error
    })

    // TODO handle passing body to the third-party API
    // @see https://stackoverflow.com/questions/9920208/expressjs-raw-body/13565786
    // externalRequest.write(body)

    externalRequest.end()
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
  // Set the status code
  if (externalResponse.statusCode) {
    res.status(externalResponse.statusCode)
  }

  // Set headers
  for (let header in externalResponse.headers) {
    const headerValue = externalResponse.httpVersionMajor[header]
    if (headerValue) {
      res.setHeader(header, headerValue)
    }
  }

  // Append data
  externalResponse.on('data', chunk => {
    res.write(chunk)
  })

  // Close request
  externalResponse.on('end', () => {
    res.end()
  })
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
      accessToken: oauthPayload.accessToken,
      refreshToken: oauthPayload.refreshToken
    },
    headers: options.headers
  }

  return { ...interpolate(options, '', variables), url: options.url }
}

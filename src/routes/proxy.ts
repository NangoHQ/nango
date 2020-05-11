/**
 * Proxy feature
 *
 * Use Pizzly as a proxy and let handle the authentication as well as the right path.
 */

import * as express from 'express'
import https from 'https'
import * as integrations from '../lib/integrations'
import * as authentications from '../lib/authentications'

const proxy = express.Router()

proxy.all('/:integration*', async (req, res, next) => {
  // Pseudocode
  // 1. Get setupId
  // 2. Get authId
  // 3. Get configuration
  // 4. Make the request
  // 5. If it failed for an authorization reason
  //    1. Refresh the token
  //    2. Make the request (again)
  // 6. Return response

  // Retrieve request inputs
  const authId = req.get('Pizzly-Auth-Id') || ''
  const integrationName = req.params.integration

  // Retrieve integration & authentication details
  const integration = await integrations.get(integrationName)
  const authentication = await authentications.get(integrationName, authId)

  // Prepare the request
  const endpoint = req.originalUrl.substring(('/proxy/' + integrationName).length + 1)
  const url = new URL(endpoint, integration.request.baseURL)
  const options = {
    url: URL,
    method: req.method,
    headers: { ...integration.request.headers }
  }

  if (authentication) {
  }

  // Make the request
  // @ts-ignore
  const externalRequest = https.request(url, options, externalResponse => {
    // Return status code
    res.status(externalResponse.statusCode)

    // Set headers
    for (let header in externalResponse.headers) {
      res.setHeader(header, externalResponse.headers[header])
    }

    // Append data
    externalResponse.on('data', chunk => {
      res.send(chunk)
    })

    // Close request
    externalResponse.on('end', () => {
      res.end()
    })
  })

  // Handle error
  externalRequest.on('error', error => {
    throw new Error(error)
  })

  // TODO handle passing body to the third-party API
  // externalRequest.write(req.body)
  externalRequest.end()
})

/**
 * Error handling (middleware)
 */

proxy.use((req, res, next) => {
  return res.status(404).json({ error: true, message: 'Ressource not found' })
})

proxy.use((err, req, res, next) => {
  console.error(err)
  return res.status(500).json({ error: true, message: 'Bad request (error logged).' })
})

export { proxy }

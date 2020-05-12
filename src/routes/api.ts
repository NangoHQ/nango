import * as express from 'express'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../lib/database'
import * as access from '../lib/access'
import * as integrations from '../lib/integrations'
import { Types } from '../types'

const api = express.Router()

/**
 * API authentication middleware.
 *
 * Authenticate requests to the API using a secret key.
 * This requires that you've previously secured your Pizzly's instance.
 * Learn more at https://github.com/Bearer/Pizzly/wiki/Secure
 */

api.use('*', access.secretKey)

/**
 * Authentications endpoints:
 *
 * - GET /github/authentications/1ab2c3...
 * - DELETE /github/authentications/1ab2c3...
 */

/**
 * Retrieves an authentication (including OAuth payload).
 */

api.get('/:integrationId/authentications/:authenticationId', async (req, res) => {
  const integrationId = req.params.integrationId
  const authenticationId = req.params.authenticationId

  const authentication = await store('authentications')
    .select('auth_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: integrationId, auth_id: authenticationId })
    .first()

  if (!authentication) {
    return res.status(404).json({
      error: {
        type: 'unknown_authentication',
        message: `No authentication found having the id "${authenticationId}" for the integration "${integrationId}".`
      }
    })
  }

  res.status(200).json({ id: authenticationId, object: 'authentication', ...authentication })
})

/**
 * Delete an authentication by removing it from the database
 * (subsequent requests using the same authId will fail).
 */

api.delete('/:integrationId/authentications/:authenticationId', async (req, res) => {
  const integrationId = req.params.integrationId
  const authenticationId = req.params.authenticationId

  const affectedRows = await store('authentications')
    .where({ buid: integrationId, auth_id: authenticationId })
    .del()

  if (!affectedRows) {
    return res.status(404).json({
      error: {
        type: 'unknown_authentication',
        message: `No authentication found having the id "${authenticationId}" for the integration "${integrationId}".`
      }
    })
  }

  res.status(200).json({ message: 'Authentication removed' })
})

/**
 * Configurations endpoint:
 *
 * - POST /github/configurations
 * - GET /github/configurations/a1b2c3...
 * - PUT /github/configurations/a1b2c3...
 * - PATCH /github/configurations/a1b2c3...
 * - DELETE /github/configurations/a1b2c3...
 */

/**
 * Saves a new configuration
 */

api.post('/:integrationId/configurations', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    res
      .status(404)
      .json({ error: { type: 'unknown_integration', message: `Integration "${integrationId}" was not found.` } })
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    res.status(400).json({
      error: {
        type: 'invalid_scopes',
        message: `Scopes are malformed. Must be in the form string[].`
      }
    })
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    res.status(400).json({
      error: {
        type: 'invalid_credentials',
        message: `Credentials are malformed. Must be an object in the form "{ clientId:string, clientSecret:string }" for an OAuth2 based API or "{ consumerKey:string, consumerSecret:string }" for an OAuth1 based API.`
      }
    })
    return
  }

  const configurationId = uuidv4()
  const configuration: Types.Configuration = {
    id: configurationId,
    object: 'configuration',
    scopes,
    credentials
  }

  await store('configurations').insert({
    buid: integrationId,
    setup_id: configurationId,
    credentials,
    scopes
  })

  res.json({
    message: 'Configuration registered',
    configuration,
    setup_id: configurationId // Legacy - We might consider removing that
  })
})

/**
 * Retrieve a configuration
 */

api.get('/:integrationId/:configurations/:configurationId', async (req, res) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const config = await store('configurations')
    .select('credentials', 'scopes', 'created_at', 'updated_at')
    .where({ buid: integrationId, setup_id: configurationId })
    .first()

  if (!config) {
    return res.status(404).json({
      error: {
        type: 'unknown_configuration',
        message: `No configuration found having the id "${configurationId}" for the integration "${integrationId}".`
      }
    })
  }

  const configuration: Types.Configuration = {
    id: configurationId,
    object: 'configuration',
    scopes: config.scopes,
    credentials: config.credentials
  }

  res.json(configuration)
})

/**
 * Delete a configuration
 */

api.delete('/:integrationId/:configurations/:configurationId', async (req, res) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const affectedRows = await store('configurations')
    .where({ buid: integrationId, setup_id: configurationId })
    .del()

  if (!affectedRows) {
    return res.status(404).json({
      error: {
        type: 'unknown_configuration',
        message: `No configuration found having the id "${configurationId}" for the integration "${integrationId}".`
      }
    })
  }

  res.status(200).json({ message: 'Configuration removed' })
})

/**
 * Update a configuration
 */

api.put('/:integrationId/:configurations/:configurationId', async (req, res) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    res
      .status(404)
      .json({ error: { type: 'unknown_integration', message: `Integration "${integrationId}" was not found.` } })
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    res.status(400).json({
      error: {
        type: 'invalid_scopes',
        message: `Scopes are malformed. Must be in the form string[].`
      }
    })
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    res.status(400).json({
      error: {
        type: 'invalid_credentials',
        message: `Credentials are malformed. Must be an object in the form "{ clientId:string, clientSecret:string }" for an OAuth2 based API or "{ consumerKey:string, consumerSecret:string }" for an OAuth1 based API.`
      }
    })
    return
  }

  const configuration: Types.Configuration = {
    id: configurationId,
    object: 'configuration',
    scopes,
    credentials
  }

  const affectedRows = await store('configurations')
    .where({ buid: integrationId, setup_id: configurationId })
    .update({
      credentials,
      scopes
    })

  if (!affectedRows) {
    res.status(400).json({
      error: {
        type: 'unknown_configuration',
        message: `No configuration found having the id "${configurationId}" for the integration "${integrationId}".`
      }
    })
    return
  }

  res.json({
    message: 'Configuration updated',
    configuration,
    setup_id: configurationId // Legacy - We might consider removing that
  })
})

// api.patch('/:integrationId/:configurations/:configurationId', handler)

/**
 * Error handling (middleware)
 */

api.use((req, res, next) => {
  return res.status(404).json({ error: { type: 'missing', message: 'Ressource not found' } })
})

api.use((err, req, res, next) => {
  console.error(err)
  return res.status(400).json({ error: { type: 'invalid', message: 'Bad request.' } })
})

/**
 * Export routes
 */

export { api }

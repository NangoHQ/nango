import * as express from 'express'
import bodyParser from 'body-parser'
import { v4 as uuidv4 } from 'uuid'
import { store } from '../lib/database'
import * as access from '../lib/access'
import * as integrations from '../lib/integrations'
import { Types } from '../types'
import { PizzlyError } from '../lib/error-handling'

const api = express.Router()

api.use(bodyParser.urlencoded({ extended: false }))
api.use(bodyParser.json({ limit: '5mb' }))

/**
 * API authentication middleware.
 *
 * Authenticate requests to the API using a secret key.
 * This requires that you've previously secured your Pizzly's instance.
 * Learn more at https://github.com/Bearer/Pizzly/wiki/Secure
 */

api.use('*', access.secretKey)

/**
 * API test endpoint:
 */

api.get('/', (req, res) => {
  return res.status(200).json({
    message: 'Successfully connected to the Pizzly API.'
  })
})

/**
 * API test endpoint:
 */

api.get('/:integrationId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  return res.status(200).json({
    id: integrationId,
    object: 'integration',
    ...integration
  })
})

/**
 * Retrieves an authentication (including OAuth payload).
 */

api.get('/:integrationId/authentications/:authenticationId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authenticationId = req.params.authenticationId

  const authentication = await store('authentications')
    .select('auth_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: integrationId, auth_id: authenticationId })
    .first()

  if (!authentication) {
    next(new PizzlyError('unknown_authentication'))
    return
  }

  res.status(200).json({ id: authenticationId, object: 'authentication', ...authentication })
})

/**
 * Delete an authentication by removing it from the database
 * (subsequent requests using the same authId will fail).
 */

api.delete('/:integrationId/authentications/:authenticationId', async (req, res, next) => {
  const integrationId = req.params.integrationId
  const authenticationId = req.params.authenticationId

  const affectedRows = await store('authentications')
    .where({ buid: integrationId, auth_id: authenticationId })
    .del()

  if (!affectedRows) {
    next(new PizzlyError('unknown_authentication'))
    return
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
    next(new PizzlyError('unknown_integration'))
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    next(new PizzlyError('invalid_scopes'))
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    next(new PizzlyError('invalid_credentials'))
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

api.get('/:integrationId/:configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const savedConfig = await store('configurations')
    .select('credentials', 'scopes', 'created_at', 'updated_at')
    .where({ buid: integrationId, setup_id: configurationId })
    .first()

  if (!savedConfig) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  const configuration: Types.Configuration = {
    id: configurationId,
    object: 'configuration',
    scopes: savedConfig.scopes,
    credentials: savedConfig.credentials
  }

  res.json(configuration)
})

/**
 * Delete a configuration
 */

api.delete('/:integrationId/:configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const affectedRows = await store('configurations')
    .where({ buid: integrationId, setup_id: configurationId })
    .del()

  if (!affectedRows) {
    next(new PizzlyError('unknown_configuration'))
    return
  }

  res.status(200).json({ message: 'Configuration removed' })
})

/**
 * Update a configuration
 */

api.put('/:integrationId/:configurations/:configurationId', async (req, res, next) => {
  const integrationId = String(req.params.integrationId)
  const configurationId = String(req.params.configurationId)

  const integration = await integrations.get(integrationId).catch(() => {
    return null
  })

  if (!integration) {
    next(new PizzlyError('unknown_integration'))
    return
  }

  const userScopes = req.body.scopes || []

  if (!Array.isArray(userScopes)) {
    next(new PizzlyError('invalid_scopes'))
    return
  }

  const scopes: string[] = integrations.validateConfigurationScopes(userScopes.join('\n')) || []
  const credentials = integrations.validateConfigurationCredentials(req.body.credentials, integration)

  if (!credentials) {
    next(new PizzlyError('invalid_credentials'))
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
    next(new PizzlyError('unknown_configuration'))
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
  let status = 400
  let type = 'invalid'
  let message = 'Bad request'

  if (err.type && err.status && err.message) {
    status = err.status
    type = err.type
    message = err.message
  } else {
    console.error(err)
  }

  return res.status(status).json({ error: { type, message } })
})

/**
 * Export routes
 */

export { api }

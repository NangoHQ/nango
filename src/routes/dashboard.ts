/**
 * Dashboard routes
 *
 * Pizzly's dashboard helps you manage the project using a browser.
 * Whilst most methods are available through the API, we felt it's more convenient
 * and it reduces the learning curve to use the project through a browser.
 */

import * as express from 'express'
import { v4 as uuidv4 } from 'uuid'
import * as integrations from '../lib/integrations'
import { store } from '../lib/database'
import { authentication } from '../lib/authentication'
import { Types } from '../types'

const dashboard = express.Router()

/**
 * Authentication middleware.
 *
 * Authenticate requests to the dashboard using a BASIC authentication.
 * This requires that you've previously secured your Pizzly's instance.
 * Learn more at https://github.com/Bearer/Pizzly/wiki/Secure
 */

dashboard.use('*', authentication.basic)

/**
 * General middleware to surchage the request variable with some EJS properties.
 * This ease how we render files by the EJS template engine.
 */

dashboard.use('/', (req, res, next) => {
  // @ts-ignore
  req.ejs = {
    datetimeOptions: {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour12: false,
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric'
    },
    dateOptions: {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }
  }

  return next()
})

/**
 * Dashboard's homepage
 *
 * @render the list of enabled APIs
 */

dashboard.get('/', async (req, res) => {
  const list = await integrations.list()
  const configurations = await store('configurations')
    .select('buid')
    .groupBy('buid')

  const enabled = list.filter(integration => {
    for (let i = 0; i < configurations.length; i++) {
      if (configurations[i].buid === integration.id) {
        return true
      }
    }

    return false
  })

  // @ts-ignore
  req.data = { ...req.data, enabled }

  res.render('dashboard/home', { req })
})

/**
 * All APIs page
 *
 * @render the list of all APIs available in the "/integrations" directory
 */

dashboard.get('/all', async (req, res) => {
  const list = await integrations.list()

  // @ts-ignore
  req.data = { ...req.data, integrations: list }
  res.render('dashboard/home-all', { req })
})

dashboard.use('/:integration', async (req, res, next) => {
  const api = await integrations.get(req.params.integration).catch(err => next(err))

  // @ts-ignore
  req.ejs = { ...req.ejs, base_url: `/dashboard/${req.params.integration}` }

  // @ts-ignore
  req.data = { ...req.data, api }

  return next()
})

/**
 * Integration's overview
 */

dashboard.get('/:integration', async (req, res) => {
  const integration = String(req.params.integration)
  const configurations = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: integration })
    .orderBy('created_at', 'desc')
    .limit(5)
    .offset(0)

  const credentials: IntegrationCredential[] = []
  configurations.forEach(item => {
    credentials.push(formatCredential(item))
  })

  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: integration })
    .orderBy('updated_at', 'desc')
    .limit(5)
    .offset(0)

  // @ts-ignore
  req.data = { ...req.data, credentials, authentications }

  res.render('dashboard/api', { req })
})

/**
 * Integration > Credentials
 */

/**
 * List all the credentials saved
 */

dashboard.get('/:integration/credentials', async (req, res) => {
  const startAt = Number(req.query.startAt) || 0
  const configurations = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.integration })
    .orderBy('updated_at', 'desc')
    .limit(25)
    .offset(startAt > 0 ? startAt : 0)

  const credentials: IntegrationCredential[] = []
  configurations.forEach(item => {
    credentials.push(formatCredential(item))
  })

  // @ts-ignore
  req.data = { ...req.data, credentials }

  res.render('dashboard/api-credentials', { req })
})

/**
 * New credentials form (GET)
 */

dashboard.get('/:integration/credentials/new', (req, res) => {
  res.render('dashboard/api-credentials-new', { req })
})

/**
 * New credentials form handler (POST)
 */

dashboard.post('/:integration/credentials/new', async (req, res) => {
  const scopes = integrations.validateConfigurationScopes(String(req.body.scopes))
  // @ts-ignore
  const integration = req.data.api as Types.Integration
  const newSetup = formatSetup(String(req.body.setupKey), String(req.body.setupSecret), integration)
  const setup = integrations.validateConfigurationCredentials(newSetup, integration)
  const setup_id = uuidv4()

  await store('configurations').insert({
    buid: req.params.integration,
    setup_id,
    setup,
    scopes
  })

  // @ts-ignore
  res.redirect(302, `${req.ejs.base_url}`)
})

/**
 * Update credentials form
 */

dashboard.get('/:integration/credentials/:setupId', async (req, res) => {
  const setupId = String(req.params.setupId)
  const configuration = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.integration, setup_id: setupId })
    .first()

  if (!configuration) {
    throw new Error('Unknown setupId.')
  }

  // @ts-ignore
  req.data = { ...req.data, credential: formatCredential(configuration) }

  res.render('dashboard/api-credentials-edit', { req })
})

/**
 * Update credentials form handler (POST)
 */

dashboard.post('/:integration/credentials/:setupId', async (req, res) => {
  const setupId = String(req.params.setupId)
  // @ts-ignore
  const integration = req.data.api as Types.Integration
  const newSetup = formatSetup(String(req.body.setupKey), String(req.body.setupSecret), integration)
  const setup = integrations.validateConfigurationCredentials(newSetup, integration)
  const scopes = integrations.validateConfigurationScopes(String(req.body.scopes))

  await store('configurations')
    .update({
      setup_id: setupId,
      setup,
      scopes
    })
    .where({ buid: req.params.integration, setup_id: setupId })

  // @ts-ignore
  res.redirect(302, `${req.ejs.base_url}`)
})

/**
 * Integration > Authentications
 */

/**
 * List all the authentications generated
 */

dashboard.get('/:integration/authentications', async (req, res) => {
  const startAt = Number(req.query.startAt) || 0
  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: req.params.integration })
    .orderBy('updated_at', 'desc')
    .limit(25)
    .offset(startAt > 0 ? startAt : 0)

  // @ts-ignore
  req.data = { ...req.data, authentications }

  res.render('dashboard/api-authentications', { req })
})

/**
 * Connect generation to the integration
 */

dashboard.get('/:integration/authentications/connect', (req, res) => {
  res.render('dashboard/api-authentications-connect', { req })
})

/**
 * Render information about a specific authentication (authId)
 */

dashboard.get('/:integration/authentications/:authId', async (req, res) => {
  const authId = String(req.params.authId)
  const authentication = await store('authentications')
    .select('auth_id', 'payload', 'created_at', 'updated_at')
    .where({ buid: req.params.integration, auth_id: authId })
    .first()

  // @ts-ignore
  req.data = { ...req.data, authentication }

  res.render('dashboard/api-authentications-item', { req })
})

/**
 * Integration > Monitoring
 */

dashboard.get('/:integration/monitoring', (req, res) => {
  res.render('dashboard/api-monitoring', { req })
})

/**
 * 404 Handler
 */

dashboard.use((req, res, next) => {
  return res.status(404).render('404')
})

dashboard.use((err, req, res, next) => {
  console.error(err)
  return res.status(500).render('500')
})

/**
 * Helpers
 */

const formatCredential = (data): IntegrationCredential => {
  return {
    setupId: data.setup_id,
    setupKey: data.setup.clientId || data.setup.consumerKey,
    setupSecret: data.setup.clientSecret || data.setup.consumersecret,
    scopes: data.scopes || [],
    created_at: new Date(data.created_at)
  }
}

const formatSetup = (
  setupKey: string,
  setupSecret: string,
  integration: Types.Integration
): { [key: string]: string } | undefined => {
  const integrationConfig = integration.config
  const isOAuth2 = integrationConfig.authType == 'OAUTH2'
  const isOAuth1 = integrationConfig.authType == 'OAUTH1'

  if (isOAuth1) {
    return { consumerKey: setupKey, consumersecret: setupSecret }
  } else if (isOAuth2) {
    return { clientId: setupKey, clientSecret: setupSecret }
  }

  return
}

interface IntegrationCredential {
  setupId: string
  setupKey: string
  setupSecret: string
  scopes: string[]
  created_at: Date
}

export { dashboard }

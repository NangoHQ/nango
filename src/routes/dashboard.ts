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

const dashboard = express.Router()

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

dashboard.get('/', (req, res) => {
  res.render('dashboard/home', { req })
})

dashboard.get('/all', async (req, res) => {
  const apis = await integrations.list()
  res.render('dashboard/home-all', { req, data: { apis } })
})

dashboard.use('/:api', async (req, res, next) => {
  const api = await integrations.get(req.params.api)

  // @ts-ignore
  req.ejs = { ...req.ejs, base_url: `/dashboard/${req.params.api}` }

  // @ts-ignore
  req.data = { ...req.data, api }

  return next()
})

dashboard.get('/:api', async (req, res) => {
  const configurations = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.api })
    .orderBy('created_at', 'desc')
    .limit(5)
    .offset(0)

  const credentials: IntegrationCredential[] = []
  configurations.forEach(item => {
    credentials.push(formatCredential(item))
  })

  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: req.params.api })
    .orderBy('updated_at', 'desc')
    .limit(5)
    .offset(0)

  // @ts-ignore
  req.data = { ...req.data, credentials, authentications }

  res.render('dashboard/api', { req })
})

/**
 * API > Credentials
 */

// List credentials saved
dashboard.get('/:api/credentials', async (req, res) => {
  const configurations = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.api })
    .limit(1)

  const credentials: IntegrationCredential[] = []
  configurations.forEach(item => {
    credentials.push(formatCredential(item))
  })

  // @ts-ignore
  req.data = { ...req.data, credentials }

  res.render('dashboard/api-credentials', { req })
})

// Form to save new credentials
dashboard.get('/:api/credentials/new', (req, res) => {
  res.render('dashboard/api-credentials-new', { req })
})

// Form handler (POST)
dashboard.post('/:api/credentials/new', async (req, res) => {
  const setup_id = uuidv4()
  const scopes = validateConfigurationScopes(String(req.body.scopes))
  const setup = validateConfigurationSetup(req)

  await store('configurations').insert({
    buid: req.params.api,
    setup_id,
    setup,
    scopes
  })

  // @ts-ignore
  res.redirect(302, `${req.ejs.base_url}`)
})

// Update a pair of credentials
dashboard.get('/:api/credentials/:setup_id', async (req, res) => {
  const configuration = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.api, setup_id: req.params.setup_id })
    .first()

  if (!configuration) {
    throw new Error('Unknown setupId.')
  }

  // @ts-ignore
  req.data = { ...req.data, credential: formatCredential(configuration) }

  res.render('dashboard/api-credentials-edit', { req })
})

// Form handler (POST)
dashboard.post('/:api/credentials/:setup_id', async (req, res) => {
  const setup_id = req.params.setup_id
  const scopes = validateConfigurationScopes(String(req.body.scopes))
  const setup = validateConfigurationSetup(req)

  await store('configurations')
    .update({
      setup_id,
      setup,
      scopes
    })
    .where({ buid: req.params.api, setup_id })

  // @ts-ignore
  res.redirect(302, `${req.ejs.base_url}`)
})

dashboard.get('/:api/authentications', async (req, res) => {
  const startAt = Number(req.query.startAt) || 0
  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: req.params.api })
    .orderBy('updated_at', 'desc')
    .limit(25)
    .offset(startAt > 0 ? startAt : 0)

  // @ts-ignore
  req.data = { ...req.data, authentications }

  res.render('dashboard/api-authentications', { req })
})

dashboard.get('/:api/authentications/:auth_id', async (req, res) => {
  const authentication = await store('authentications')
    .select('auth_id', 'user_attributes', 'created_at', 'updated_at')
    .where({ buid: req.params.api, auth_id: req.params.auth_id })
    .first()

  // @ts-ignore
  req.data = { ...req.data, authentication }

  res.render('dashboard/api-authentications-item', { req })
})

dashboard.get('/:api/monitoring', (req, res) => {
  res.render('dashboard/api-monitoring', { req })
})

const formatCredential = (data): IntegrationCredential => {
  return {
    setupId: data.setup_id,
    setupKey: data.setup.clientID || data.setup.consumerKey,
    setupSecret: data.setup.clientSecret || data.setup.consumersecret,
    scopes: data.scopes || [],
    created_at: new Date(data.created_at)
  }
}

const validateConfigurationScopes = (scopesAsString: string): string[] | null => {
  const scopes: string = ((String(scopesAsString) as string) || '').trim()

  return (scopes && scopes.split('\n')) || null
}

const validateConfigurationSetup = req => {
  const integrationConfig = req.data.api.config
  const isOAuth2 = integrationConfig.authType == 'OAUTH2'
  const isOAuth1 = integrationConfig.authType == 'OAUTH1'

  let setup = {}

  if (isOAuth1) {
    setup = { consumerKey: String(req.body.setupKey), consumerSecret: String(req.body.setupSecret) }
  } else if (isOAuth2) {
    setup = { clientID: String(req.body.setupKey), clientSecret: String(req.body.setupSecret) }
  }

  return setup
}

interface IntegrationCredential {
  setupId: string
  setupKey: string
  setupSecret: string
  scopes: string[]
  created_at: Date
}

export { dashboard }

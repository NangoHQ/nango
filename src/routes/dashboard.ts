/**
 * Dashboard routes
 *
 * Pizzly's dashboard helps you manage the project using a browser.
 * Whilst most methods are available through the API, we felt it's more convenient
 * and it reduces the learning curve to use the project through a browser.
 */

import * as express from 'express'
import * as integrations from '../lib/integrations'
import { store } from '../lib/database'

const dashboard = express.Router()

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
  const credentials = await store('configurations')
    .select('setup', 'setup_id', 'scopes', 'created_at')
    .where({ buid: req.params.api })
    .limit(5)
    .offset(0)

  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: req.params.api })
    .limit(5)
    .offset(0)

  // @ts-ignore
  const data = { credentials, authentications }

  res.render('dashboard/api', { req })
})

dashboard.get('/:api/credentials', (req, res) => {
  res.render('dashboard/api-credentials', { req })
})

dashboard.get('/:api/credentials/new', (req, res) => {
  res.render('dashboard/api-credentials-form', { req })
})

dashboard.get('/:api/credentials/:setup-id', (req, res) => {
  res.render('dashboard/api-credentials-form', { req })
})

dashboard.get('/:api/users', async (req, res) => {
  const startAt = Number(req.query.startAt) || 0
  const authentications = await store('authentications')
    .select('auth_id', 'setup_id', 'created_at', 'updated_at')
    .where({ buid: req.params.api })
    .limit(25)
    .offset(startAt > 0 ? startAt : 0)

  // @ts-ignore
  const data = { authentications }

  res.render('dashboard/api-users', { req, data })
})

dashboard.get('/:api/monitoring', (req, res) => {
  res.render('dashboard/api-monitoring', { req })
})

export { dashboard }

/**
 * Dashboard routes
 *
 * Pizzly's dashboard helps you manage the project using a browser.
 * Whilst most methods are available through the API, we felt it's more convenient
 * and it reduces the learning curve to use the project through a browser.
 */

import * as express from 'express'
import * as integrations from '../lib/integrations'

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

  // @ts-ignore TODO
  if (!req.ejs) {
    // @ts-ignore
    req.ejs = {}
  }

  // @ts-ignore
  req.ejs.base_url = `/dashboard/${req.params.api}`

  // @ts-ignore
  req.data = { api }

  return next()
})

dashboard.get('/:api', (req, res) => {
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

dashboard.get('/:api/users', (req, res) => {
  res.render('dashboard/api-users', { req })
})

dashboard.get('/:api/monitoring', (req, res) => {
  res.render('dashboard/api-monitoring', { req })
})

export { dashboard }

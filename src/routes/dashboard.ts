/**
 * Dashboard routes
 *
 * Pizzly's dashboard helps you manage the project using a browser.
 * Whilst most methods are available through the API, we felt it's more convenient
 * and it reduces the learning curve to use the project through a browser.
 */

import * as express from 'express'
const dashboard = express.Router()

dashboard.get('/', (req, res) => {
  res.render('dashboard/home', { req })
})

dashboard.get('/all', (req, res) => {
  res.render('dashboard/home-all', { req })
})

dashboard.use('/:api', (req, res, next) => {
  // @ts-ignore TODO
  if (!req.ejs) {
    // @ts-ignore
    req.ejs = {}
  }

  // @ts-ignore
  req.ejs.base_url = `/dashboard/${req.params.api}`

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

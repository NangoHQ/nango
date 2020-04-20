const express = require('express')
const app = express()
const dashboard = express()

const PORT = process.env.PORT || 5000

app.use('/assets', express.static('views/assets'))
app.use('/dashboard', dashboard)

/**
 * Dashboard routing
 */

dashboard.set('view engine', 'ejs')

dashboard.get('/', (req, res) => {
  res.render('dashboard/home', { req })
})

dashboard.get('/all', (req, res) => {
  res.render('dashboard/home-all', { req })
})

dashboard.use('/:api', (req, res, next) => {
  if (!req.ejs) {
    req.ejs = {}
  }

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

app.listen(PORT, () => console.log(`Pizzly listening at http://localhost:${PORT}`))

/**
 * Homepage
 *
 * Gives useful links to a new developer who's getting started on Pizzly.
 * This URL might be unavailable after authentication has been enabled.
 */

import * as express from 'express'

const home = express.Router()

home.get('/', (req, res) => {
  res.render('home')
})

export { home }

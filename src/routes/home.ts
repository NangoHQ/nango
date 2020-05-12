/**
 * Homepage
 *
 * Gives useful links to a new developer who's getting started on Pizzly.
 * This URL might be unavailable after authentication has been enabled.
 */

import * as express from 'express'
import * as access from '../lib/access'

const home = express.Router()

/**
 * Secure access to the homepage using BASIC authentication method
 */

home.use('*', access.basic)

/**
 * Render the homepage
 */

home.get('/', (req, res) => {
  res.render('home')
})

export { home }

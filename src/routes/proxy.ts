/**
 * Proxy feature
 *
 * Use Pizzly as a proxy to make authenticated
 * requests to third-party APIs.
 */

import express from 'express'
import { incomingRequestHandler } from '../lib/proxy'

const proxy = express.Router()

/**
 * Handle proxy requests.
 *
 * Some examples:
 *  - GET /github/user/ will retrieve information from GitHub API on the "/user" endpoint
 *  - POST /slack/reminders.add will create a reminder on Slack API "/reminders.add" endpoint.
 */

proxy.all('/:integration*', incomingRequestHandler)

/**
 * Error handling
 */

proxy.use((req, res, next) => {
  return res.status(404).json({ error: { type: 'missing', message: 'Ressource not found' } })
})

proxy.use((err, req, res, next) => {
  console.error(err)

  let status = 400
  let type = 'invalid'
  let message = 'Bad request'

  switch (err.message) {
    case 'missing_auth_id':
      type = err.message
      message = 'A valid auth_id is required to proceed with the proxy request.'
      break
    case 'unknown_integration':
      type = err.message
      message = 'The provided integration could not be found on the server.'
      break
    case 'unknown_authentication':
      type = err.message
      message = 'The provided authId could not be found on the database.'
      break
  }
  return res.status(status).json({ error: { type, message } })
})

export { proxy }

import * as express from 'express'
import { cors } from '../proxy/cors'
import authV3, { authRouter } from '../auth/v3/router'
import { initializeDB } from '../lib/database'
import functions from '../functions/router'

const legacy = express.Router()

/**
 * Legacy endpoints for authentication.
 *
 * In Bearer.sh, users where triggering an OAuth dance by requesting:
 * https://int.bearer.sh/v2/auth/[API-NAME]?clientId=[SECRET-KEY]
 *
 * In return, they had to register the following callback URL
 * https://int.bearer.sh/v2/auth/callback
 * */

const auth = legacy.use('/', cors, initializeDB, authV3())

/**
 * Legacy endpoints for the proxy feature
 *
 * In Bearer.sh, users where also able to use a proxy that was populating
 * each request to the distant API with the right credentials. It was working like this
 * https://int.bearer.sh/api/v4/functions/[API-NAME]/[ENDPOINT-PATH]
 */

const proxy = legacy.use('/', cors, initializeDB, functions())

/**
 * TODO - What was this for?
 * @cfabianski might be helpful here.
 */

const apis = legacy.use('/', cors, initializeDB, authRouter())

export { auth, proxy, apis }

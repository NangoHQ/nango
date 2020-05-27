/**
 * Auth (authentication) routes
 *
 * These routes handle the OAuth-dances (with support of OAuth2.0 and OAuth1.a).
 * Most code is "legacy", meaning it's an ongoing transition from Bearer.sh previous
 * codebase to this new repo. Feel free to contribute to make this transition faster.
 */

import * as express from 'express'
import bodyParser from 'body-parser'
import cookieParser from 'cookie-parser'
import passport from 'passport'
import authV3 from '../legacy/auth/v3/router'
import { initializeDB } from '../lib/database'

const { COOKIE_SECRET } = process.env
const auth = express.Router()

/**
 * Parse the body
 */

auth.use(bodyParser.urlencoded({ extended: false }))
auth.use(bodyParser.json({ limit: '5mb' }))
auth.use(cookieParser(COOKIE_SECRET || 'cookie-secret'))
auth.use(passport.initialize())

/**
 * Use legacy endpoint to handle OAuth-dance
 */

auth.use('/', initializeDB, authV3())

export { auth }

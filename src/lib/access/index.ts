import { Request, Response, NextFunction } from 'express'
import { PizzlyError } from '../error-handling'

/**
 * Basic Access Authentication Middleware
 * @see https://tools.ietf.org/html/rfc7617
 */

const basic = (req: Request, res: Response, next: NextFunction) => {
  const credentials = {
    user: process.env.DASHBOARD_USERNAME || process.env.DASHBOARD_USER,
    password: process.env.DASHBOARD_PASSWORD
  }

  if (!credentials.user && !credentials.password) {
    next()
    return
  }

  const authorizationHeader = req.get('authorization')

  if (!authorizationHeader) {
    res.status(401)
    res.setHeader('WWW-Authenticate', 'Basic')
    res.render('errors/401')
    return
  }

  const { providedUser, providedPassword } = fromBasicAuth(authorizationHeader)

  if (providedUser !== credentials.user || providedPassword !== credentials.password) {
    res.status(401)
    res.setHeader('WWW-Authenticate', 'Basic')
    res.render('errors/401')
    return
  }

  next()
}

/**
 * Secret Key Access Authentication
 *
 * It uses the BASIC authentication schema
 * where only the username is provided and
 * must match the developer's SECRET_KEY.
 *
 * To change your SECRET_KEY have a look to
 * the .envrc file.
 */

const secretKey = (req: Request, res: Response, next: NextFunction) => {
  const secretKey = process.env.SECRET_KEY

  if (!secretKey) {
    next()
    return
  }

  const authorizationHeader = req.get('authorization')

  if (!authorizationHeader) {
    throw new PizzlyError('missing_secret_key')
  }

  const { providedUser } = fromBasicAuth(authorizationHeader)

  if (providedUser !== secretKey) {
    throw new PizzlyError('invalid_secret_key')
  }

  next()
}

/**
 * Publishable Key Access Authentication
 *
 * It requires a `?pizzly_pkey=....` in the request
 * query params. Such query params is remove on the
 * proxy feature (like all query params starting with
 * "pizzly_").
 *
 * To change your PUBLISHABLE_KEY have a look to
 * the .envrc file.
 */

const publishableKey = (req: Request, res: Response, next: NextFunction) => {
  const publishableKey = process.env.PUBLISHABLE_KEY

  if (!publishableKey) {
    next()
    return
  }

  const providedPublishableKey = req.query['pizzly_pkey']

  if (typeof providedPublishableKey !== 'string') {
    throw new PizzlyError('missing_publishable_key')
  }

  if (providedPublishableKey !== publishableKey) {
    throw new PizzlyError('invalid_publishable_key')
  }

  next()
}

/**
 * Helper to explode a basic authorization header
 *
 * @param authorizationHeader (string) - The full authorization header
 * @returns Object
 *  - providedUser (string) - The provided user
 *  - providedPassword (string) - The provided password
 */

const fromBasicAuth = (authorizationHeader: string) => {
  const basicAsBase64 = authorizationHeader.split('Basic ').pop() || ''
  const basicAsBuffer = Buffer.from(basicAsBase64, 'base64')
  const basicAsString = basicAsBuffer.toString('utf-8')

  const providedCredentials = basicAsString.split(':')
  const providedUser: string = providedCredentials.shift() || ''
  const providedPassword: string = providedCredentials.shift() || ''

  return { providedUser, providedPassword }
}

/**
 * Export authentication methods
 */

export { basic, secretKey, publishableKey }

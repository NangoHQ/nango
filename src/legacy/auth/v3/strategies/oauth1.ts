import http from 'http'
import passport from 'passport'
import { OAuth } from 'oauth'
import OAuth1Strategy from 'passport-oauth1'
import { NextFunction, Response } from 'express'
import { createNamespace } from 'cls-hooked'

import {
  TAuthenticateRequest,
  IOAuth1Credentials,
  IFetchAuthDetailsParams,
  TIntegrationConfig,
  OAuth1SignatureMethod
} from '../types'
import { AuthenticationFailed, InvalidAuthId } from '../errors'
// import { getSetupDetails, getAuth, TOAuth1Payload } from '../../../clients/integrations'
import { checkSetupIdConsistency } from './setup-id-consistency'

const responseData = createNamespace('BearerOAuth1ResponseData')

const originalCreateClient = (OAuth.prototype as any)._createClient
;(OAuth.prototype as any)._createClient = function(...args) {
  responseData.set('response', undefined)

  const request: http.ClientRequest = originalCreateClient.apply(this, args)

  request.once('response', response => {
    responseData.set('response', response)
  })

  return request
}

type VerifyCallback = (err?: Error | null, user?: object, info?: object) => void

type VerifyFunction = (
  accessToken: string,
  refreshToken: string,
  params: any,
  profile: any,
  verified: VerifyCallback
) => void

interface StrategyOptions {
  consumerKey: string
  consumerSecret: string
  requestTokenURL: string
  tokenParams?: any
  accessTokenURL: string
  userAuthorizationURL: string
  authorizationParams?: any
  signatureMethod?: string
  callbackURL: string
  customHeaders?: any
}

class Strategy extends OAuth1Strategy {
  private _authorizationParams: any
  private _tokenParams: any

  constructor(options: StrategyOptions, verify: VerifyFunction) {
    super(options, verify)
    this._authorizationParams = options.authorizationParams
    this._tokenParams = options.tokenParams
  }

  userAuthorizationParams() {
    return this._authorizationParams || {}
  }

  requestTokenParams() {
    return this._tokenParams || {}
  }

  parseErrorResponse(body: string, statusCode: number) {
    return new AuthenticationFailed({ statusCode, body })
  }
}

const strategyOptions = (req: TAuthenticateRequest) => {
  const callbackURL = process.env.AUTH_CALLBACK_URL || `${req.protocol}://${req.get('host')}/auth/callback`
  const { consumerKey, consumerSecret } = req.setupDetails.credentials
  const {
    requestTokenURL,
    tokenParams,
    accessTokenURL,
    userAuthorizationURL,
    authorizationParams,
    signatureMethod
  } = req.integrationConfig
  return {
    consumerKey,
    consumerSecret,
    requestTokenURL,
    tokenParams,
    accessTokenURL,
    userAuthorizationURL,
    authorizationParams,
    signatureMethod,
    callbackURL
  }
}

const parseExpires = (expiresIn?: string) => {
  if (!expiresIn) {
    return 0
  }

  const result = parseInt(expiresIn, 10)

  if (isNaN(result)) {
    return 0
  }

  return result
}

export const authenticate = (req: TAuthenticateRequest, res: Response, next: NextFunction) => {
  // This is invoked after we've been called back by the third party, and when Passport
  // thinks we've succesfully got a token
  const verify = (accessToken: string, tokenSecret: string, params: any, _profile: any, verified: VerifyCallback) => {
    if (!accessToken) {
      return verified(undefined, undefined, { message: 'No access token returned', response: params })
    }
    const { consumerKey, consumerSecret } = req.setupDetails

    const credentials: IOAuth1Credentials = {
      consumerKey,
      consumerSecret,
      accessToken,
      tokenSecret,
      expiresIn: parseExpires(params.expires_in)
    }

    // The OAuth library removes the token/secret from the body data.
    // Add them back in so we can store the response data as it was originally received
    const body = {
      ...params,
      oauth_token: accessToken,
      oauth_token_secret: tokenSecret
    }

    verified(undefined, { body, credentials })
  }

  // This is invoked at the end of the Passport process when either an error has occurred,
  // authentication failed, or we have successfully authenticated. This might have been invoked
  // as a consequence of the `verified` callback above, or by Passport internally
  const authenticateCallback = (err: any, data: CallbackData | undefined, info: any) => {
    if (err) {
      return next(err)
    }

    if (!data) {
      return next(AuthenticationFailed.fromOAuthRequest(req, info))
    }

    const { body, credentials } = data

    req.credentials = credentials
    req.tokenResponse = {
      body,
      headers: responseData.get('response').headers
    }

    next()
  }

  responseData.run(() => {
    passport.use(new Strategy(strategyOptions(req), verify) as any)
    passport.authenticate('oauth', authenticateCallback)(req, res, next)
  })
}

export const nullAuthDetails = {
  accessToken: null,
  tokenSecret: null,
  consumerKey: null,
  consumerSecret: null,
  signatureMethod: null
}

export const fetchAuthDetails = async (params: IFetchAuthDetailsParams, integrationConfig: TIntegrationConfig) => {
  const {
    buid,
    // servicesTableName,
    // scopedUserDataTableName,
    // environmentIdentifier,
    // integration,
    authId,
    setupIdFromRequest,
    setupId: setupIdParam
  } = params

  const { signatureMethod = OAuth1SignatureMethod.HmacSha1 } = integrationConfig

  const credentials = {
    accessToken: 'accessToken',
    callbackParamsJSON: '{}',
    connectParams: {},
    expiresIn: 1234567890,
    tokenSecret: 'tokenSecret',
    setupId: 'setupId',
    updatedAt: 1234567890,
    consumerKey: 'consumerKey',
    consumerSecret: 'consumerSecret'
  }
  // const credentials = await getAuth<TOAuth1Payload>({
  //   servicesTableName,
  //   buid: integration.buid,
  //   authId: authId!,
  //   clientId: environmentIdentifier
  // })

  if (!credentials || !credentials.accessToken) {
    throw new InvalidAuthId(buid, authId!)
  }

  const {
    accessToken,
    callbackParamsJSON,
    connectParams = {},
    expiresIn,
    tokenSecret,
    setupId,
    updatedAt
  } = credentials
  const { consumerKey, consumerSecret } = credentials

  checkSetupIdConsistency({ setupId, setupIdParam, setupIdFromRequest })

  const callbackParams = callbackParamsJSON ? JSON.parse(callbackParamsJSON) : undefined

  if (!consumerKey || !consumerSecret) {
    // tslint:disable-next-line:semicolon
    // ;({ consumerKey, consumerSecret } = await getSetupDetails({
    //   scopedUserDataTableName,
    //   buid: integration.buid,
    //   setupId: setupId!,
    //   clientId: environmentIdentifier
    // }))
  }

  return {
    accessToken,
    callbackParams,
    connectParams,
    expiresIn,
    tokenSecret,
    consumerKey,
    consumerSecret,
    signatureMethod,
    updatedAt
  }
}

interface CallbackData {
  body: any
  credentials: IOAuth1Credentials
}

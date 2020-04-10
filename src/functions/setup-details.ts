import Joi from '@hapi/joi'
import { Response, NextFunction } from 'express'
import { v4 as uuidv4 } from 'uuid'

import { TBackendRequestV4 } from '../types'
// import { getSetupDetails, saveSetupDetails } from '../clients/integrations'
import { asyncMiddleware } from '../errorHandler'
import { SetupDetailsNotFound } from '../errors'

const makeResponse = (payload: any) => ({
  StatusCode: 200,
  Payload: JSON.stringify(payload)
})

const reportError = (req: TBackendRequestV4, next: NextFunction, error: any) => {
  req.bearerResponse = makeResponse({ error })
  return next()
}

const getOptionalSetupDetails = async (req: TBackendRequestV4, setupId: string) => {
  const {
    // buid,
    // clientId,
    // stageVariables: { scopedUserDataTableId: scopedUserDataTableName }
  } = req

  try {
    // return await getSetupDetails({ buid, clientId, scopedUserDataTableName, setupId })
  } catch (e) {
    if (e instanceof SetupDetailsNotFound) {
      return undefined
    }

    throw e
  }
}

export const setupSave = asyncMiddleware(async (req: TBackendRequestV4, _res: Response, next: NextFunction) => {
  const { referenceId } = req.query
  const { setup } = req.body

  if (!setup) {
    return reportError(req, next, {
      code: 'MISSING_SETUP',
      message: 'Please provide a setup object containing information { setup: { ... } }'
    })
  }

  const { authType } = await req.integration.config()

  if (setup.type) {
    setup.type = setup.type.toUpperCase()
  } else {
    setup.type = authType
  }

  const { error: typeError } = Joi.validate(setup, formatValidator, { abortEarly: false })
  if (typeError) {
    return reportError(req, next, typeError)
  }

  if (setup.type !== authType) {
    return reportError(req, next, {
      code: 'INCONSISTENT_AUTH_TYPE',
      message:
        'The auth type of the supplied setup details must match the auth type of the API. ' +
        ` The supplied setup type was '${setup.type}' but the API is '${authType}'.`
    })
  }

  const { error } = Joi.validate(setup, validator[setup.type], { abortEarly: false })
  if (error) {
    return reportError(req, next, error)
  }

  // We can't store empty values
  for (const key in setup) {
    if (!setup[key]) {
      delete setup[key]
    }
  }

  const ref = referenceId || uuidv4()
  const exist = await getOptionalSetupDetails(req, ref)
  if (exist) {
    return reportError(req, next, {
      code: 'EXISTING_SETUP',
      message: 'A setup already exists with this reference'
    })
  }

  // await saveSetupDetails({ buid, clientId, scopedUserDataTableName, setupId: ref, data: setup })
  req.bearerResponse = makeResponse({ data: { ...setup, setupId: ref }, referenceId: ref })

  next()
})

export const setupRetrieve = asyncMiddleware(async (req: TBackendRequestV4, _res: Response, next: NextFunction) => {
  const { referenceId } = req.query

  if (!referenceId) {
    return reportError(req, next, {
      code: 'MISSING_PARAMETER',
      message: 'Please provide a referenceId'
    })
  }

  const data = await getOptionalSetupDetails(req, referenceId)
  req.bearerResponse = makeResponse({ referenceId, data: Boolean(data) })

  next()
})

enum AuthType {
  OAuth2 = 'OAUTH2',
  OAuth1 = 'OAUTH1'
}

const joiExtended = Joi.extend({
  name: 'authType',
  base: Joi.string()
    .valid(Object.values(AuthType))
    .required()
})

const oauth2Validator = Joi.object().keys({
  clientID: Joi.string()
    .required()
    .allow(''),
  clientSecret: Joi.string()
    .required()
    .allow(''),
  type: joiExtended.authType()
})

const oauth1Validator = Joi.object().keys({
  consumerKey: Joi.string()
    .required()
    .allow(''),
  consumerSecret: Joi.string()
    .required()
    .allow(''),
  type: joiExtended.authType()
})

const formatValidator = Joi.object()
  .keys({
    type: joiExtended.authType()
  })
  .unknown(true)

const validator = {
  [AuthType.OAuth2]: oauth2Validator,
  [AuthType.OAuth1]: oauth1Validator
}
